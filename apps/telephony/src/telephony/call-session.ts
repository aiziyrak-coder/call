import { Injectable, Logger } from '@nestjs/common';
import { canTransition, isTerminal, CallDirection, CallDisposition, CallState } from '@aicc/shared';

export interface CallSession {
  callId: string;
  tenantId: string;
  direction: CallDirection;
  state: CallState;

  /** Mijoz (tashqi) tomonning kanali. */
  customerChannelId?: string;
  /** Operator (brauzer softfoni) kanali. */
  operatorChannelId?: string;
  bridgeId?: string;

  fromNumber: string;
  toNumber: string;
  peerKey: string;

  operatorId?: string;
  contactId?: string;
  queueId?: string;
  trunk?: string;

  recordingName?: string;
  /** AI media forki uchun snoop kanallari. */
  mediaForkChannelIds: string[];
  /** AudioSocket ulanish UUID lari — ai-worker shu kalitlar bo'yicha topadi. */
  mediaForkIds: string[];
  /** Supervisor tinglash/pichirlash kanallari. */
  spyChannelIds: string[];

  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  holdCount: number;
  hangupCause?: string;
  disposition?: CallDisposition;
}

/**
 * Faol suhbatlar reyestri. Bitta kanal id bo'yicha ham qidirish kerak,
 * chunki ARI hodisalari kanal darajasida keladi.
 */
@Injectable()
export class CallRegistry {
  private readonly logger = new Logger(CallRegistry.name);
  private readonly byCallId = new Map<string, CallSession>();
  private readonly channelToCall = new Map<string, string>();

  create(session: CallSession): CallSession {
    this.byCallId.set(session.callId, session);
    if (session.customerChannelId) this.linkChannel(session.customerChannelId, session.callId);
    if (session.operatorChannelId) this.linkChannel(session.operatorChannelId, session.callId);
    return session;
  }

  linkChannel(channelId: string, callId: string): void {
    this.channelToCall.set(channelId, callId);
  }

  unlinkChannel(channelId: string): void {
    this.channelToCall.delete(channelId);
  }

  get(callId: string): CallSession | undefined {
    return this.byCallId.get(callId);
  }

  getByChannel(channelId: string): CallSession | undefined {
    const callId = this.channelToCall.get(channelId);
    return callId ? this.byCallId.get(callId) : undefined;
  }

  list(): CallSession[] {
    return [...this.byCallId.values()];
  }

  listForTenant(tenantId: string): CallSession[] {
    return this.list().filter((session) => session.tenantId === tenantId);
  }

  /**
   * Holatni faqat ruxsat etilgan o'tish bo'yicha o'zgartiradi.
   * ARI hodisalari tartibsiz kelishi mumkin, shu sababli noto'g'ri o'tish
   * xatoga olib kelmaydi — shunchaki e'tiborsiz qoldiriladi.
   */
  transition(callId: string, next: CallState): { changed: boolean; from?: CallState } {
    const session = this.byCallId.get(callId);
    if (!session) return { changed: false };
    if (session.state === next) return { changed: false, from: session.state };

    if (!canTransition(session.state, next)) {
      this.logger.debug(`O'tish rad etildi: ${session.state} -> ${next} (call=${callId})`);
      return { changed: false, from: session.state };
    }

    const from = session.state;
    session.state = next;
    if (next === 'ANSWERED' && !session.answeredAt) session.answeredAt = new Date();
    if (isTerminal(next) && !session.endedAt) session.endedAt = new Date();
    return { changed: true, from };
  }

  remove(callId: string): CallSession | undefined {
    const session = this.byCallId.get(callId);
    if (!session) return undefined;

    for (const channelId of [
      session.customerChannelId,
      session.operatorChannelId,
      ...session.mediaForkChannelIds,
      ...session.spyChannelIds,
    ]) {
      if (channelId) this.channelToCall.delete(channelId);
    }
    this.byCallId.delete(callId);
    return session;
  }

  /** Qo'ng'iroq davomiyligi (soniya). */
  static durationSec(session: CallSession): number {
    const end = session.endedAt ?? new Date();
    return Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000));
  }

  /** Suhbat vaqti — javob berilgandan tugagunga qadar. */
  static talkTimeSec(session: CallSession): number {
    if (!session.answeredAt) return 0;
    const end = session.endedAt ?? new Date();
    return Math.max(0, Math.round((end.getTime() - session.answeredAt.getTime()) / 1000));
  }

  /** Kutish vaqti — qo'ng'iroq boshlanishidan javobgacha. */
  static waitTimeSec(session: CallSession): number {
    const end = session.answeredAt ?? session.endedAt ?? new Date();
    return Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000));
  }
}
