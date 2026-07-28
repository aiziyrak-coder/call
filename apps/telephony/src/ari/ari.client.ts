import { EventEmitter } from 'node:events';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import type {
  AriBridge,
  AriChannel,
  AriEvent,
  AriRecording,
  ExternalMediaParams,
  OriginateParams,
} from './ari.types';

export class AriError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'AriError';
  }
}

/**
 * Asterisk REST Interface klienti: boshqaruv REST orqali, hodisalar esa
 * WebSocket orqali keladi. Ulanish uzilsa eksponensial kechikish bilan
 * qayta ulanadi — Asterisk qayta ishga tushganda servis o'zi tiklanadi.
 */
@Injectable()
export class AriClient extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AriClient.name);
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly password: string;
  private readonly app: string;

  private socket?: WebSocket;
  private reconnectAttempt = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;
  private connected = false;

  constructor(config: ConfigService) {
    super();
    this.setMaxListeners(50);
    this.baseUrl = config.get<string>('ARI_URL', 'http://localhost:8088').replace(/\/$/, '');
    this.user = config.get<string>('ARI_USER', 'aicc');
    this.password = config.get<string>('ARI_PASSWORD', 'aicc_ari_password');
    this.app = config.get<string>('ARI_APP', 'aicc');
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get appName(): string {
    return this.app;
  }

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  // ---------------------------------------------------------------------------
  // WebSocket hodisa oqimi
  // ---------------------------------------------------------------------------

  private connect(): void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    const url = `${wsUrl}/ari/events?app=${encodeURIComponent(this.app)}&subscribeAll=true`;

    this.socket = new WebSocket(url, {
      headers: { Authorization: this.authHeader() },
    });

    this.socket.on('open', () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.logger.log(`ARI ulanishi tayyor (app=${this.app})`);
      this.emit('connected');
    });

    this.socket.on('message', (raw: WebSocket.RawData) => {
      let event: AriEvent;
      try {
        event = JSON.parse(raw.toString()) as AriEvent;
      } catch (error) {
        this.logger.warn(`ARI hodisasini o'qib bo'lmadi: ${String(error)}`);
        return;
      }
      // Har bir hodisa turi alohida nom bilan ham chiqadi: on('StasisStart', ...)
      this.emit('event', event);
      this.emit(event.type, event);
    });

    this.socket.on('close', (code) => {
      this.connected = false;
      this.emit('disconnected');
      if (this.shuttingDown) return;
      this.scheduleReconnect(code);
    });

    this.socket.on('error', (error: Error) => {
      this.logger.error(`ARI WebSocket xatosi: ${error.message}`);
    });
  }

  private scheduleReconnect(code: number): void {
    // 1s dan boshlab 30s gacha, ikki barobar oshib boradi.
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt += 1;
    this.logger.warn(`ARI uzildi (code=${code}), ${delay} ms dan keyin qayta ulanish`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`;
  }

  // ---------------------------------------------------------------------------
  // REST
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/ari${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader(),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AriError(
        `ARI ${method} ${path} -> ${response.status} ${detail}`.trim(),
        response.status,
        path,
      );
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // -- Asterisk ---------------------------------------------------------------

  async info(): Promise<{ system: { version: string; entity_id: string } }> {
    return this.request('GET', '/asterisk/info');
  }

  // -- Kanallar ---------------------------------------------------------------

  listChannels(): Promise<AriChannel[]> {
    return this.request('GET', '/channels');
  }

  getChannel(channelId: string): Promise<AriChannel> {
    return this.request('GET', `/channels/${channelId}`);
  }

  answer(channelId: string): Promise<void> {
    return this.request('POST', `/channels/${channelId}/answer`);
  }

  ring(channelId: string): Promise<void> {
    return this.request('POST', `/channels/${channelId}/ring`);
  }

  hangup(channelId: string, reason = 'normal'): Promise<void> {
    return this.request('DELETE', `/channels/${channelId}`, { query: { reason } });
  }

  hold(channelId: string, on: boolean): Promise<void> {
    return on
      ? this.request('POST', `/channels/${channelId}/hold`)
      : this.request('DELETE', `/channels/${channelId}/hold`);
  }

  mute(channelId: string, on: boolean, direction: 'in' | 'out' | 'both' = 'both'): Promise<void> {
    return on
      ? this.request('POST', `/channels/${channelId}/mute`, { query: { direction } })
      : this.request('DELETE', `/channels/${channelId}/mute`, { query: { direction } });
  }

  sendDtmf(channelId: string, dtmf: string): Promise<void> {
    return this.request('POST', `/channels/${channelId}/dtmf`, {
      query: { dtmf, between: 100, duration: 100 },
    });
  }

  playMusicOnHold(channelId: string, on: boolean): Promise<void> {
    return on
      ? this.request('POST', `/channels/${channelId}/moh`)
      : this.request('DELETE', `/channels/${channelId}/moh`);
  }

  getChannelVar(channelId: string, variable: string): Promise<{ value: string }> {
    return this.request('GET', `/channels/${channelId}/variable`, { query: { variable } });
  }

  setChannelVar(channelId: string, variable: string, value: string): Promise<void> {
    return this.request('POST', `/channels/${channelId}/variable`, {
      query: { variable, value },
    });
  }

  originate(params: OriginateParams): Promise<AriChannel> {
    const { variables, ...query } = params;
    return this.request('POST', '/channels', {
      query: query as Record<string, unknown>,
      body: variables ? { variables } : undefined,
    });
  }

  /**
   * Kanalning audiosini nusxalab beruvchi "snoop" kanali.
   * `spy` yo'nalishi tinglash uchun, `whisper` esa faqat operatorga gapirish uchun.
   */
  snoop(
    channelId: string,
    options: {
      app: string;
      appArgs?: string;
      spy?: 'none' | 'both' | 'in' | 'out';
      whisper?: 'none' | 'both' | 'in' | 'out';
      snoopId?: string;
    },
  ): Promise<AriChannel> {
    return this.request('POST', `/channels/${channelId}/snoop`, {
      query: options as unknown as Record<string, unknown>,
    });
  }

  externalMedia(params: ExternalMediaParams): Promise<AriChannel> {
    const { variables, ...query } = params;
    return this.request('POST', '/channels/externalMedia', {
      query: query as unknown as Record<string, unknown>,
      body: variables ? { variables } : undefined,
    });
  }

  // -- Ko'priklar -------------------------------------------------------------

  createBridge(bridgeId: string, type = 'mixing'): Promise<AriBridge> {
    return this.request('POST', '/bridges', { query: { bridgeId, type } });
  }

  getBridge(bridgeId: string): Promise<AriBridge> {
    return this.request('GET', `/bridges/${bridgeId}`);
  }

  destroyBridge(bridgeId: string): Promise<void> {
    return this.request('DELETE', `/bridges/${bridgeId}`);
  }

  addToBridge(bridgeId: string, channelIds: string[], role?: string): Promise<void> {
    return this.request('POST', `/bridges/${bridgeId}/addChannel`, {
      query: { channel: channelIds.join(','), role },
    });
  }

  removeFromBridge(bridgeId: string, channelIds: string[]): Promise<void> {
    return this.request('POST', `/bridges/${bridgeId}/removeChannel`, {
      query: { channel: channelIds.join(',') },
    });
  }

  // -- Yozib olish ------------------------------------------------------------

  recordBridge(bridgeId: string, name: string, format = 'wav'): Promise<AriRecording> {
    return this.request('POST', `/bridges/${bridgeId}/record`, {
      query: {
        name,
        format,
        ifExists: 'overwrite',
        beep: false,
        // Sukut saqlash bo'yicha to'xtatmaymiz — butun suhbat yozilishi kerak.
        maxSilenceSeconds: 0,
        maxDurationSeconds: 0,
      },
    });
  }

  recordChannel(channelId: string, name: string, format = 'wav'): Promise<AriRecording> {
    return this.request('POST', `/channels/${channelId}/record`, {
      query: {
        name,
        format,
        ifExists: 'overwrite',
        beep: false,
        maxSilenceSeconds: 0,
        maxDurationSeconds: 0,
      },
    });
  }

  stopRecording(name: string): Promise<void> {
    return this.request('POST', `/recordings/live/${encodeURIComponent(name)}/stop`);
  }

  getLiveRecording(name: string): Promise<AriRecording> {
    return this.request('GET', `/recordings/live/${encodeURIComponent(name)}`);
  }
}
