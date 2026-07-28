import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  phoneSearchKey,
  mediaForkKey,
  MEDIA_FORK_TTL_SEC,
  MediaForkBinding,
  MediaSink,
  OriginateRequest,
  TransferRequest,
  TelephonyProvider,
} from '@aicc/shared';
import { AriClient } from '../ari/ari.client';
import { EventPublisher } from '../events/event-publisher.service';
import { CallRegistry, CallSession } from './call-session';
import { RoutingService } from './routing.service';

/**
 * `TelephonyProvider` ning Asterisk/ARI implementatsiyasi.
 * Android zaxira kanali kelajakda shu interfeysning boshqa implementatsiyasi
 * bo'ladi, shuning uchun Core API faqat interfeys bilan ishlaydi.
 */
@Injectable()
export class AsteriskTelephonyProvider implements TelephonyProvider {
  readonly name = 'asterisk-ari';
  private readonly logger = new Logger(AsteriskTelephonyProvider.name);
  private readonly outboundTemplate: string;
  private readonly originateTimeout: number;
  private readonly sttLanguage: string;

  constructor(
    private readonly ari: AriClient,
    private readonly registry: CallRegistry,
    private readonly routing: RoutingService,
    private readonly events: EventPublisher,
    config: ConfigService,
  ) {
    this.outboundTemplate = config.get<string>(
      'OUTBOUND_ENDPOINT_TEMPLATE',
      'PJSIP/{number}@gsm-gateway',
    );
    this.originateTimeout = config.get<number>('ORIGINATE_TIMEOUT_SEC', 45);
    this.sttLanguage = config.get<string>('STT_LANGUAGE', 'ru');
  }

  /**
   * CRM dan "click-to-call": avval operator chaqiriladi, u ko'targach mijozga
   * qo'ng'iroq ketadi. Shu tartib operator go'shakni ko'tarmasdan mijozga
   * qo'ng'iroq ketib qolishining oldini oladi.
   */
  async originate(request: OriginateRequest): Promise<string> {
    const tenantId = await this.routing.resolveTenantByTrunk(request.trunk);
    if (!tenantId) throw new BadRequestException('Faol tenant topilmadi');

    const operator = await this.routing.getOperatorById(tenantId, request.operatorId);
    if (!operator) {
      throw new BadRequestException('Operatorga SIP raqami biriktirilmagan yoki u faol emas');
    }

    const callId = randomUUID();
    const session: CallSession = {
      callId,
      tenantId,
      direction: 'OUTBOUND',
      state: 'CREATED',
      fromNumber: operator.extension,
      toNumber: request.to,
      peerKey: phoneSearchKey(request.to),
      operatorId: operator.userId,
      contactId: request.contactId,
      trunk: request.trunk,
      mediaForkChannelIds: [],
      mediaForkIds: [],
      spyChannelIds: [],
      startedAt: new Date(),
      holdCount: 0,
    };
    this.registry.create(session);

    await this.ari.originate({
      endpoint: `PJSIP/${operator.extension}`,
      app: this.ari.appName,
      appArgs: `operator-leg,${callId}`,
      callerId: `AiCC <${request.to}>`,
      timeout: this.originateTimeout,
      variables: { AICC_CALL_ID: callId, AICC_CLICK_TO_CALL: '1' },
    });

    this.logger.log(`Click-to-call boshlandi: ${operator.extension} -> ${request.to} (${callId})`);
    return callId;
  }

  async answer(callId: string): Promise<void> {
    const session = this.require(callId);
    const channelId = session.operatorChannelId ?? session.customerChannelId;
    if (channelId) await this.ari.answer(channelId);
  }

  async hangup(callId: string): Promise<void> {
    const session = this.require(callId);
    const channels = [session.operatorChannelId, session.customerChannelId].filter(
      (id): id is string => Boolean(id),
    );
    await Promise.allSettled(channels.map((id) => this.ari.hangup(id, 'normal')));
  }

  async hold(callId: string, on: boolean): Promise<void> {
    const session = this.require(callId);
    if (!session.customerChannelId) throw new BadRequestException("Mijoz kanali yo'q");
    // Mijozga kutish musiqasi qo'yiladi, operator esa ko'prikdan chiqarilmaydi.
    await this.ari.hold(session.customerChannelId, on);
    await this.ari.playMusicOnHold(session.customerChannelId, on).catch(() => undefined);
  }

  async mute(callId: string, on: boolean): Promise<void> {
    const session = this.require(callId);
    if (!session.operatorChannelId) throw new BadRequestException("Operator kanali yo'q");
    await this.ari.mute(session.operatorChannelId, on, 'out');
  }

  async transfer(request: TransferRequest): Promise<void> {
    const session = this.require(request.callId);
    if (!session.customerChannelId || !session.bridgeId) {
      throw new BadRequestException("Faol ko'prik yo'q");
    }

    const isExtension = /^\d{3,5}$/.test(request.target);
    const endpoint = isExtension
      ? `PJSIP/${request.target}`
      : this.outboundTemplate.replace('{number}', request.target.replace(/^\+/, ''));

    this.registry.transition(session.callId, 'TRANSFERRING');

    if (request.mode === 'blind') {
      // Joriy operatorni ko'prikdan chiqaramiz va yangi ishtirokchini chaqiramiz.
      if (session.operatorChannelId) {
        await this.ari
          .removeFromBridge(session.bridgeId, [session.operatorChannelId])
          .catch(() => undefined);
        await this.ari.hangup(session.operatorChannelId).catch(() => undefined);
        this.registry.unlinkChannel(session.operatorChannelId);
        session.operatorChannelId = undefined;
      }
    }

    const target = await this.ari.originate({
      endpoint,
      app: this.ari.appName,
      appArgs: `operator-leg,${session.callId}`,
      callerId: session.fromNumber,
      timeout: this.originateTimeout,
      variables: { AICC_CALL_ID: session.callId, AICC_TRANSFER: request.mode },
    });

    // Attended rejimda uch tomon bir ko'prikda qoladi — operator tanishtirib,
    // so'ng o'zi uzilishi mumkin.
    if (request.mode === 'attended') {
      await this.ari.addToBridge(session.bridgeId, [target.id]).catch(() => undefined);
    }
  }

  async sendDtmf(callId: string, digits: string): Promise<void> {
    const session = this.require(callId);
    if (!session.customerChannelId) throw new BadRequestException("Mijoz kanali yo'q");
    await this.ari.sendDtmf(session.customerChannelId, digits);
  }

  async startRecording(callId: string): Promise<string> {
    const session = this.require(callId);
    if (!session.bridgeId) throw new BadRequestException("Faol ko'prik yo'q");
    if (session.recordingName) return session.recordingName;

    await this.ari.recordBridge(session.bridgeId, session.callId, 'wav');
    session.recordingName = session.callId;
    return session.recordingName;
  }

  async stopRecording(callId: string): Promise<void> {
    const session = this.require(callId);
    if (!session.recordingName) return;
    await this.ari.stopRecording(session.recordingName);
  }

  /**
   * Suhbat audiosini AI ga uzatish. Har bir tomon uchun alohida snoop kanali
   * ochiladi — bu diarizatsiyani (kim gapirdi) STT modeliga tashlab qo'ymaydi.
   */
  async startMediaFork(callId: string, sink: MediaSink): Promise<string> {
    const session = this.require(callId);
    if (!session.customerChannelId || !session.operatorChannelId) {
      throw new BadRequestException("Ikkala kanal ham faol bo'lishi kerak");
    }

    const created: string[] = [];
    for (const [speaker, channelId] of [
      ['CUSTOMER', session.customerChannelId],
      ['OPERATOR', session.operatorChannelId],
    ] as const) {
      const snoop = await this.ari.snoop(channelId, {
        app: this.ari.appName,
        appArgs: `media-fork,${callId},${speaker}`,
        spy: 'in',
        whisper: 'none',
        snoopId: `snoop-${speaker.toLowerCase()}-${callId}`,
      });

      // AudioSocket ulanishni faqat UUID bilan tanitadi, shuning uchun
      // "qaysi qo'ng'iroq / qaysi tomon" ma'lumoti Redis ga yoziladi.
      const forkId = randomUUID();
      await this.events.setKey(
        mediaForkKey(forkId),
        {
          callId,
          tenantId: session.tenantId,
          speaker,
          language: this.sttLanguage,
          sampleRate: sink.format === 'slin16' ? 16000 : 8000,
        } satisfies MediaForkBinding,
        MEDIA_FORK_TTL_SEC,
      );
      session.mediaForkIds.push(forkId);

      const media = await this.ari.externalMedia({
        app: this.ari.appName,
        external_host: `${sink.host}:${sink.port}`,
        format: sink.format,
        encapsulation: sink.transport === 'audiosocket' ? 'audiosocket' : 'rtp',
        transport: sink.transport === 'audiosocket' ? 'tcp' : 'udp',
        connection_type: 'client',
        direction: 'both',
        data: forkId,
        channelId: `media-${speaker.toLowerCase()}-${callId}`,
      });

      const bridgeId = `fork-${speaker.toLowerCase()}-${callId}`;
      await this.ari.createBridge(bridgeId, 'mixing');
      await this.ari.addToBridge(bridgeId, [snoop.id, media.id]);

      created.push(snoop.id, media.id);
      session.mediaForkChannelIds.push(snoop.id, media.id);
      this.registry.linkChannel(snoop.id, callId);
      this.registry.linkChannel(media.id, callId);
    }

    this.logger.log(`Media fork yoqildi (call=${callId}, ${created.length} ta kanal)`);
    return created.join(',');
  }

  async stopMediaFork(callId: string): Promise<void> {
    const session = this.require(callId);
    await Promise.allSettled(session.mediaForkChannelIds.map((id) => this.ari.hangup(id)));
    for (const speaker of ['customer', 'operator']) {
      await this.ari.destroyBridge(`fork-${speaker}-${callId}`).catch(() => undefined);
    }
    await Promise.allSettled(
      session.mediaForkIds.map((id) => this.events.deleteKey(mediaForkKey(id))),
    );
    session.mediaForkChannelIds = [];
    session.mediaForkIds = [];
  }

  /** Supervisor: tinglash, pichirlash yoki suhbatni to'liq qabul qilish. */
  async spy(
    callId: string,
    supervisorExtension: string,
    mode: 'listen' | 'whisper' | 'barge',
  ): Promise<void> {
    const session = this.require(callId);
    if (!session.bridgeId) throw new BadRequestException("Faol ko'prik yo'q");

    if (mode === 'barge') {
      // Barge — supervisor to'g'ridan-to'g'ri suhbat ko'prigiga qo'shiladi.
      const channel = await this.ari.originate({
        endpoint: `PJSIP/${supervisorExtension}`,
        app: this.ari.appName,
        appArgs: `spy,${callId}`,
        callerId: 'Supervisor',
        timeout: 30,
      });
      await this.ari.addToBridge(session.bridgeId, [channel.id]);
      session.spyChannelIds.push(channel.id);
      this.registry.linkChannel(channel.id, callId);
      return;
    }

    if (!session.operatorChannelId) throw new BadRequestException("Operator kanali yo'q");

    const supervisorChannel = await this.ari.originate({
      endpoint: `PJSIP/${supervisorExtension}`,
      app: this.ari.appName,
      appArgs: `spy,${callId}`,
      callerId: 'Supervisor',
      timeout: 30,
    });

    // listen — faqat eshitish; whisper — supervisor ovozi faqat operatorga boradi.
    const snoop = await this.ari.snoop(session.operatorChannelId, {
      app: this.ari.appName,
      appArgs: `spy,${callId}`,
      spy: 'both',
      whisper: mode === 'whisper' ? 'out' : 'none',
      snoopId: `spy-${callId}-${supervisorExtension}`,
    });

    const bridgeId = `spy-${callId}-${supervisorExtension}`;
    await this.ari.createBridge(bridgeId, 'mixing');
    await this.ari.addToBridge(bridgeId, [supervisorChannel.id, snoop.id]);

    session.spyChannelIds.push(supervisorChannel.id, snoop.id);
    this.registry.linkChannel(supervisorChannel.id, callId);
    this.registry.linkChannel(snoop.id, callId);
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    if (!this.ari.isConnected) return { healthy: false, detail: 'ARI WebSocket ulanmagan' };
    try {
      const info = await this.ari.info();
      return { healthy: true, detail: `Asterisk ${info.system.version}` };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private require(callId: string): CallSession {
    const session = this.registry.get(callId);
    if (!session) throw new NotFoundException(`Faol qo'ng'iroq topilmadi: ${callId}`);
    return session;
  }
}
