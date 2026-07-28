import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OriginateRequest, TransferRequest } from '@aicc/shared';

export interface ActiveCallSnapshot {
  callId: string;
  tenantId: string;
  direction: string;
  state: string;
  from: string;
  to: string;
  operatorId?: string;
  contactId?: string;
  queueId?: string;
  startedAt: string;
  answeredAt?: string;
  durationSec: number;
  talkTimeSec: number;
  hasMediaFork: boolean;
  recordingName?: string;
}

/** Core API dan telefoniya servisiga qiluvchi HTTP klient. */
@Injectable()
export class TelephonyClient {
  private readonly logger = new Logger(TelephonyClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('TELEPHONY_INTERNAL_URL', 'http://localhost:4100/internal')
      .replace(/\/$/, '');
    this.token = config.getOrThrow<string>('SERVICE_TOKEN');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/telephony${path}`, {
        method,
        headers: {
          'x-aicc-service-token': this.token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(
        `Telefoniya servisiga ulanib bo'lmadi: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Telefoniya servisi javob bermayapti');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HttpException(detail || `Telefoniya xatosi (${response.status})`, response.status);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  health(): Promise<{ healthy: boolean; detail?: string }> {
    return this.request('GET', '/health');
  }

  activeCalls(): Promise<ActiveCallSnapshot[]> {
    return this.request('GET', '/calls');
  }

  originate(request: OriginateRequest): Promise<{ callId: string }> {
    return this.request('POST', '/calls/originate', request);
  }

  answer(callId: string): Promise<void> {
    return this.request('POST', `/calls/${callId}/answer`);
  }

  hangup(callId: string): Promise<void> {
    return this.request('POST', `/calls/${callId}/hangup`);
  }

  hold(callId: string, on: boolean): Promise<void> {
    return this.request('POST', `/calls/${callId}/hold`, { on });
  }

  mute(callId: string, on: boolean): Promise<void> {
    return this.request('POST', `/calls/${callId}/mute`, { on });
  }

  transfer(request: TransferRequest): Promise<void> {
    return this.request('POST', `/calls/${request.callId}/transfer`, {
      target: request.target,
      mode: request.mode,
    });
  }

  sendDtmf(callId: string, digits: string): Promise<void> {
    return this.request('POST', `/calls/${callId}/dtmf`, { digits });
  }

  startMediaFork(
    callId: string,
    sink: { host: string; port: number; format: string; transport: string },
  ): Promise<{ channels: string }> {
    return this.request('POST', `/calls/${callId}/media-fork/start`, sink);
  }

  stopMediaFork(callId: string): Promise<void> {
    return this.request('POST', `/calls/${callId}/media-fork/stop`);
  }

  spy(
    callId: string,
    supervisorExtension: string,
    mode: 'listen' | 'whisper' | 'barge',
  ): Promise<void> {
    return this.request('POST', `/calls/${callId}/spy`, { supervisorExtension, mode });
  }
}
