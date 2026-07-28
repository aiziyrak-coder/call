import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REDIS_STREAMS,
  normalizePhone,
  phoneSearchKey,
  CallDirection,
  CallDisposition,
} from '@aicc/shared';
import { AriClient } from '../ari/ari.client';
import type {
  AriChannel,
  ChannelDestroyedEvent,
  ChannelDtmfReceivedEvent,
  ChannelHoldEvent,
  ChannelStateChangeEvent,
  RecordingFinishedEvent,
  StasisEndEvent,
  StasisStartEvent,
} from '../ari/ari.types';
import { EventPublisher } from '../events/event-publisher.service';
import { AsteriskTelephonyProvider } from './asterisk.provider';
import { CallRegistry, CallSession } from './call-session';
import { RoutingService } from './routing.service';

/** StasisStart birinchi argumenti — kanalning suhbatdagi roli. */
type ChannelRole =
  | 'inbound'
  | 'outbound'
  | 'internal'
  | 'originated'
  | 'operator-leg'
  | 'customer-leg'
  | 'media-fork'
  | 'spy';

@Injectable()
export class StasisService implements OnModuleInit {
  private readonly logger = new Logger(StasisService.name);
  private readonly outboundTemplate: string;
  private readonly originateTimeout: number;
  private readonly transcriptionEnabled: boolean;
  private readonly audioSocketHost: string;
  private readonly audioSocketPort: number;

  constructor(
    private readonly ari: AriClient,
    private readonly registry: CallRegistry,
    private readonly routing: RoutingService,
    private readonly events: EventPublisher,
    private readonly provider: AsteriskTelephonyProvider,
    config: ConfigService,
  ) {
    this.outboundTemplate = config.get<string>(
      'OUTBOUND_ENDPOINT_TEMPLATE',
      'PJSIP/{number}@gsm-gateway',
    );
    this.originateTimeout = config.get<number>('ORIGINATE_TIMEOUT_SEC', 45);
    this.transcriptionEnabled = config.get<string>('AI_TRANSCRIPTION_ENABLED', 'false') === 'true';
    this.audioSocketHost = config.get<string>('AUDIOSOCKET_HOST', 'host.docker.internal');
    this.audioSocketPort = Number(config.get('AUDIOSOCKET_PORT', 8090));
  }

  onModuleInit(): void {
    this.ari.on('StasisStart', (event: StasisStartEvent) => {
      void this.onStasisStart(event).catch((error: Error) =>
        this.logger.error(`StasisStart xatosi: ${error.message}`, error.stack),
      );
    });
    this.ari.on('StasisEnd', (event: StasisEndEvent) => {
      void this.onChannelGone(event.channel.id).catch((error: Error) =>
        this.logger.error(`StasisEnd xatosi: ${error.message}`),
      );
    });
    this.ari.on('ChannelDestroyed', (event: ChannelDestroyedEvent) => {
      void this.onChannelGone(event.channel.id, event.cause_txt).catch((error: Error) =>
        this.logger.error(`ChannelDestroyed xatosi: ${error.message}`),
      );
    });
    this.ari.on('ChannelStateChange', (event: ChannelStateChangeEvent) => {
      void this.onChannelStateChange(event);
    });
    this.ari.on('ChannelHold', (event: ChannelHoldEvent) => void this.onHold(event, true));
    this.ari.on('ChannelUnhold', (event: ChannelHoldEvent) => void this.onHold(event, false));
    this.ari.on('ChannelDtmfReceived', (event: ChannelDtmfReceivedEvent) => {
      this.logger.debug(`DTMF "${event.digit}" (channel=${event.channel.id})`);
    });
    this.ari.on('RecordingFinished', (event: RecordingFinishedEvent) => {
      void this.onRecordingFinished(event);
    });
  }

  // ---------------------------------------------------------------------------
  // Kanal Stasis ga kirdi
  // ---------------------------------------------------------------------------

  private async onStasisStart(event: StasisStartEvent): Promise<void> {
    const role = (event.args[0] ?? 'inbound') as ChannelRole;
    const channel = event.channel;

    this.logger.log(
      `StasisStart role=${role} channel=${channel.name} args=${event.args.join(',')}`,
    );

    switch (role) {
      case 'inbound':
        await this.handleInbound(channel, event.args[1]);
        break;
      case 'outbound':
      case 'internal':
        await this.handleOperatorDialed(channel, event.args[1], role === 'internal');
        break;
      case 'operator-leg':
        await this.handleOperatorLeg(channel, event.args[1]);
        break;
      case 'customer-leg':
        await this.handleCustomerLeg(channel, event.args[1]);
        break;
      case 'media-fork':
      case 'spy':
        // Bu kanallar bridge ga alohida joyda qo'shiladi; bu yerda hech narsa qilinmaydi.
        break;
      default:
        this.logger.warn(`Noma'lum rol "${role}", kanal tugatilmoqda`);
        await this.ari.hangup(channel.id).catch(() => undefined);
    }
  }

  /** GSM-shlyuzdan kelgan kiruvchi qo'ng'iroq. */
  private async handleInbound(channel: AriChannel, dialedExten?: string): Promise<void> {
    const trunk = await this.readVar(channel.id, 'AICC_TRUNK');
    const tenantId = await this.routing.resolveTenantByTrunk(trunk);
    if (!tenantId) {
      await this.ari.hangup(channel.id, 'congestion').catch(() => undefined);
      return;
    }

    const fromNumber =
      normalizePhone(channel.caller.number) ?? channel.caller.number ?? 'anonymous';
    const toNumber = dialedExten ?? channel.dialplan.exten;

    const session = this.registry.create({
      callId: randomUUID(),
      tenantId,
      direction: 'INBOUND',
      state: 'CREATED',
      customerChannelId: channel.id,
      fromNumber,
      toNumber,
      peerKey: phoneSearchKey(fromNumber),
      trunk,
      mediaForkChannelIds: [],
      mediaForkIds: [],
      spyChannelIds: [],
      startedAt: new Date(),
      holdCount: 0,
    });

    const [contactId, queue] = await Promise.all([
      this.routing.findContactByPhone(tenantId, fromNumber),
      this.routing.findQueueByExtension(tenantId, toNumber),
    ]);
    session.contactId = contactId ?? undefined;
    session.queueId = queue?.id;

    // Mijozga chaqiruv signali beriladi, operator qidirilayotganda kutadi.
    await this.ari.ring(channel.id).catch(() => undefined);
    this.registry.transition(session.callId, 'RINGING');

    const operator = await this.routing.selectOperator(tenantId, queue?.strategy);
    if (!operator) {
      this.logger.warn(`Bo'sh operator yo'q — qo'ng'iroq rad etilmoqda (call=${session.callId})`);
      await this.publishRinging(session);
      await this.finish(session, 'ABANDONED', 'no available operator');
      await this.ari.hangup(channel.id, 'congestion').catch(() => undefined);
      return;
    }

    session.operatorId = operator.userId;
    await this.publishRinging(session);
    await this.dialOperator(session, operator.extension);
  }

  /** Brauzerdagi operator o'zi raqam terdi (from-operator konteksti). */
  private async handleOperatorDialed(
    channel: AriChannel,
    dialedExten: string | undefined,
    isInternal: boolean,
  ): Promise<void> {
    const extension = channel.caller.number;
    const tenantId = await this.routing.resolveTenantByTrunk(undefined);
    if (!tenantId) {
      await this.ari.hangup(channel.id, 'congestion').catch(() => undefined);
      return;
    }

    const operator = await this.findOperatorByExtension(tenantId, extension);
    const target = dialedExten ?? channel.dialplan.exten;
    const toNumber = isInternal ? target : (normalizePhone(target) ?? target);

    const session = this.registry.create({
      callId: randomUUID(),
      tenantId,
      direction: isInternal ? 'INTERNAL' : 'OUTBOUND',
      state: 'CREATED',
      operatorChannelId: channel.id,
      fromNumber: extension,
      toNumber,
      peerKey: phoneSearchKey(toNumber),
      operatorId: operator?.userId,
      mediaForkChannelIds: [],
      mediaForkIds: [],
      spyChannelIds: [],
      startedAt: new Date(),
      holdCount: 0,
    });

    session.contactId = (await this.routing.findContactByPhone(tenantId, toNumber)) ?? undefined;

    this.registry.transition(session.callId, 'RINGING');
    await this.publishRinging(session);

    // Operator chaqiruv ohangini eshitib turadi, biz esa mijozga qo'ng'iroq qilamiz.
    await this.ari.ring(channel.id).catch(() => undefined);
    await this.dialCustomer(session, isInternal);
  }

  /** Kiruvchi qo'ng'iroq uchun biz chaqirgan operator javob berdi. */
  private async handleOperatorLeg(channel: AriChannel, callId?: string): Promise<void> {
    const session = callId ? this.registry.get(callId) : undefined;
    if (!session) {
      this.logger.warn(`operator-leg uchun sessiya topilmadi (callId=${callId})`);
      await this.ari.hangup(channel.id).catch(() => undefined);
      return;
    }

    session.operatorChannelId = channel.id;
    this.registry.linkChannel(channel.id, session.callId);
    await this.bridgeAndAnswer(session);
  }

  /** Chiquvchi qo'ng'iroq uchun biz chaqirgan mijoz javob berdi. */
  private async handleCustomerLeg(channel: AriChannel, callId?: string): Promise<void> {
    const session = callId ? this.registry.get(callId) : undefined;
    if (!session) {
      this.logger.warn(`customer-leg uchun sessiya topilmadi (callId=${callId})`);
      await this.ari.hangup(channel.id).catch(() => undefined);
      return;
    }

    session.customerChannelId = channel.id;
    this.registry.linkChannel(channel.id, session.callId);
    await this.bridgeAndAnswer(session);
  }

  // ---------------------------------------------------------------------------
  // Chaqirish
  // ---------------------------------------------------------------------------

  private async dialOperator(session: CallSession, extension: string): Promise<void> {
    try {
      await this.ari.originate({
        endpoint: `PJSIP/${extension}`,
        app: this.ari.appName,
        appArgs: `operator-leg,${session.callId}`,
        callerId: `${session.fromNumber} <${session.fromNumber}>`,
        timeout: this.originateTimeout,
        variables: { AICC_CALL_ID: session.callId },
      });
    } catch (error) {
      this.logger.error(
        `Operatorni chaqirib bo'lmadi (ext=${extension}): ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.finish(session, 'FAILED', 'operator originate failed');
      if (session.customerChannelId) {
        await this.ari.hangup(session.customerChannelId, 'congestion').catch(() => undefined);
      }
    }
  }

  private async dialCustomer(session: CallSession, isInternal: boolean): Promise<void> {
    const endpoint = isInternal
      ? `PJSIP/${session.toNumber}`
      : this.outboundTemplate.replace('{number}', session.toNumber.replace(/^\+/, ''));

    try {
      await this.ari.originate({
        endpoint,
        app: this.ari.appName,
        appArgs: `customer-leg,${session.callId}`,
        callerId: session.fromNumber,
        timeout: this.originateTimeout,
        variables: { AICC_CALL_ID: session.callId },
      });
    } catch (error) {
      this.logger.error(
        `Mijozga qo'ng'iroq qilib bo'lmadi (${endpoint}): ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.finish(session, 'FAILED', 'customer originate failed');
      if (session.operatorChannelId) {
        await this.ari.hangup(session.operatorChannelId, 'congestion').catch(() => undefined);
      }
    }
  }

  /** Ikkala oyoqni ko'prikka qo'shib, suhbatni boshlaydi va yozib olishni yoqadi. */
  private async bridgeAndAnswer(session: CallSession): Promise<void> {
    const { customerChannelId, operatorChannelId } = session;
    if (!customerChannelId || !operatorChannelId) return;

    const bridgeId = session.bridgeId ?? `aicc-${session.callId}`;
    session.bridgeId = bridgeId;

    await this.ari.createBridge(bridgeId, 'mixing');
    // Mijoz kanali hali javob berilmagan bo'lishi mumkin (kiruvchi holat).
    await this.ari.answer(customerChannelId).catch(() => undefined);
    await this.ari.answer(operatorChannelId).catch(() => undefined);
    await this.ari.addToBridge(bridgeId, [customerChannelId, operatorChannelId]);

    const { changed } = this.registry.transition(session.callId, 'ANSWERED');
    if (changed) {
      await this.events.publish({
        type: 'call.answered',
        tenantId: session.tenantId,
        callId: session.callId,
        operatorId: session.operatorId,
        answeredAt: (session.answeredAt ?? new Date()).toISOString(),
      });
    }

    await this.startRecording(session);
    await this.startTranscription(session);
  }

  /**
   * AI transkripsiyasi uchun audio forki. Suhbatni to'xtatmasligi kerak,
   * shuning uchun xatolar faqat log'ga yoziladi.
   */
  private async startTranscription(session: CallSession): Promise<void> {
    if (!this.transcriptionEnabled || session.mediaForkIds.length > 0) return;

    try {
      await this.provider.startMediaFork(session.callId, {
        host: this.audioSocketHost,
        port: this.audioSocketPort,
        format: 'slin16',
        transport: 'audiosocket',
      });
    } catch (error) {
      this.logger.error(
        `Media forkni yoqib bo'lmadi (call=${session.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async startRecording(session: CallSession): Promise<void> {
    if (!session.bridgeId || session.recordingName) return;
    const name = session.callId;
    try {
      await this.ari.recordBridge(session.bridgeId, name, 'wav');
      session.recordingName = name;
      this.logger.log(`Yozib olish boshlandi: ${name}`);
    } catch (error) {
      // Yozuv bo'lmasligi suhbatni to'xtatmasligi kerak.
      this.logger.error(
        `Yozib olishni boshlab bo'lmadi (call=${session.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Hodisalar
  // ---------------------------------------------------------------------------

  private async onChannelStateChange(event: ChannelStateChangeEvent): Promise<void> {
    const session = this.registry.getByChannel(event.channel.id);
    if (!session) return;
    if (event.channel.state === 'Up' && session.state === 'CREATED') {
      this.registry.transition(session.callId, 'RINGING');
    }
  }

  private async onHold(event: ChannelHoldEvent, on: boolean): Promise<void> {
    const session = this.registry.getByChannel(event.channel.id);
    if (!session) return;

    if (on) session.holdCount += 1;
    this.registry.transition(session.callId, on ? 'HELD' : 'ANSWERED');

    await this.events.publish({
      type: 'call.held',
      tenantId: session.tenantId,
      callId: session.callId,
      on,
    });
  }

  private async onChannelGone(channelId: string, causeText?: string): Promise<void> {
    const session = this.registry.getByChannel(channelId);
    if (!session) return;

    // Yordamchi kanallar (media fork, spy) yopilsa suhbat davom etadi.
    if (
      session.mediaForkChannelIds.includes(channelId) ||
      session.spyChannelIds.includes(channelId)
    ) {
      session.mediaForkChannelIds = session.mediaForkChannelIds.filter((id) => id !== channelId);
      session.spyChannelIds = session.spyChannelIds.filter((id) => id !== channelId);
      this.registry.unlinkChannel(channelId);
      return;
    }

    const disposition = this.resolveDisposition(session, causeText);
    await this.finish(session, disposition, causeText);
  }

  private async onRecordingFinished(event: RecordingFinishedEvent): Promise<void> {
    const callId = event.recording.name;
    const session = this.registry.get(callId);
    const tenantId = session?.tenantId ?? (await this.routing.resolveTenantByTrunk(undefined));
    if (!tenantId) return;

    await this.events.publish({
      type: 'recording.ready',
      tenantId,
      callId,
      recordingId: randomUUID(),
      // API bu kalitni spool katalogidagi fayl nomiga aylantiradi.
      objectKey: `${event.recording.name}.${event.recording.format}`,
      durationSec: event.recording.duration ?? 0,
      sizeBytes: 0,
    });
  }

  /** Suhbatni yakunlaydi: yozuvni to'xtatadi, ko'prikni buzadi, hodisa chiqaradi. */
  private async finish(
    session: CallSession,
    disposition: CallDisposition,
    causeText?: string,
  ): Promise<void> {
    if (session.state === 'ENDED' || session.state === 'FAILED') return;

    session.disposition = disposition;
    session.hangupCause = causeText;
    this.registry.transition(session.callId, disposition === 'FAILED' ? 'FAILED' : 'ENDED');

    if (session.recordingName) {
      await this.ari.stopRecording(session.recordingName).catch(() => undefined);
    }

    // Qolgan barcha kanallarni yopamiz — "osilib qolgan" kanal bo'lmasligi kerak.
    const survivors = [
      session.customerChannelId,
      session.operatorChannelId,
      ...session.mediaForkChannelIds,
      ...session.spyChannelIds,
    ].filter((id): id is string => Boolean(id));

    await Promise.allSettled(survivors.map((id) => this.ari.hangup(id)));
    if (session.bridgeId) {
      await this.ari.destroyBridge(session.bridgeId).catch(() => undefined);
    }

    await this.events.publish({
      type: 'call.ended',
      tenantId: session.tenantId,
      callId: session.callId,
      disposition,
      durationSec: CallRegistry.durationSec(session),
      talkTimeSec: CallRegistry.talkTimeSec(session),
      recordingPath: session.recordingName ? `${session.recordingName}.wav` : undefined,
    });

    this.registry.remove(session.callId);
    this.logger.log(
      `Qo'ng'iroq yakunlandi: ${session.callId} (${disposition}, ${CallRegistry.durationSec(session)}s)`,
    );
  }

  private resolveDisposition(session: CallSession, causeText?: string): CallDisposition {
    if (session.answeredAt) return 'ANSWERED';
    const cause = (causeText ?? '').toLowerCase();
    if (cause.includes('busy')) return 'BUSY';
    if (cause.includes('congestion') || cause.includes('unallocated')) return 'FAILED';
    if (session.direction === 'INBOUND') return 'ABANDONED';
    return 'NO_ANSWER';
  }

  private async publishRinging(session: CallSession): Promise<void> {
    await this.events.publish(
      {
        type: 'call.ringing',
        tenantId: session.tenantId,
        callId: session.callId,
        channelId: session.customerChannelId ?? session.operatorChannelId ?? '',
        direction: session.direction as CallDirection,
        from: session.fromNumber,
        to: session.toNumber,
        operatorId: session.operatorId,
        contactId: session.contactId,
        queueId: session.queueId,
      },
      REDIS_STREAMS.telephony,
    );
  }

  private async readVar(channelId: string, name: string): Promise<string | undefined> {
    try {
      const result = await this.ari.getChannelVar(channelId, name);
      return result.value || undefined;
    } catch {
      return undefined;
    }
  }

  private async findOperatorByExtension(tenantId: string, extension: string) {
    if (!extension) return null;
    const operator = await this.routing.getOperatorByExtension(tenantId, extension);
    return operator;
  }
}
