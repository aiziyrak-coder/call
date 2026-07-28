import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiccEvent } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Hodisalarni bazaga yozadi (event -> relyatsion proyeksiya).
 * Har bir handler idempotent: hodisa qayta yetkazilsa dublikat yaratmaydi.
 */
@Injectable()
export class CallProjectionService {
  private readonly logger = new Logger(CallProjectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Hodisa qaysi operatorga tegishli ekanini qaytaradi (socket marshrutlash uchun). */
  async apply(event: AiccEvent): Promise<string | undefined> {
    switch (event.type) {
      case 'call.ringing':
        return this.onRinging(event);
      case 'call.answered':
        return this.onAnswered(event);
      case 'call.held':
        return this.onHeld(event);
      case 'call.transferred':
        return this.onTransferred(event);
      case 'call.ended':
        return this.onEnded(event);
      case 'call.state_changed':
        return this.onStateChanged(event);
      case 'recording.ready':
        return this.operatorOfCall(event.callId);
      case 'transcript.partial':
      case 'transcript.final':
        // Suhbat matni faqat o'z operatoriga va jonli devorga ketishi kerak.
        return this.operatorOfCall(event.callId);
      case 'sms.received':
      case 'sms.status':
      case 'device.status':
        // Bu hodisalar o'z modullarida saqlanadi; bu yerda faqat uzatiladi.
        return undefined;
      default:
        return undefined;
    }
  }

  private async onRinging(
    event: Extract<AiccEvent, { type: 'call.ringing' }>,
  ): Promise<string | undefined> {
    await this.prisma.call.upsert({
      where: { tenantId_channelId: { tenantId: event.tenantId, channelId: event.channelId } },
      update: {
        state: 'RINGING',
        operatorId: event.operatorId ?? null,
        contactId: event.contactId ?? null,
        queueId: event.queueId ?? null,
      },
      create: {
        id: event.callId,
        tenantId: event.tenantId,
        channelId: event.channelId,
        direction: event.direction,
        state: 'RINGING',
        fromNumber: event.from,
        toNumber: event.to,
        peerKey: (event.direction === 'INBOUND' ? event.from : event.to).replace(/\D/g, ''),
        operatorId: event.operatorId ?? null,
        contactId: event.contactId ?? null,
        queueId: event.queueId ?? null,
        startedAt: new Date(event.occurredAt),
      },
    });
    return event.operatorId;
  }

  private async onAnswered(
    event: Extract<AiccEvent, { type: 'call.answered' }>,
  ): Promise<string | undefined> {
    await this.updateCall(event.callId, {
      state: 'ANSWERED',
      answeredAt: new Date(event.answeredAt),
      ...(event.operatorId ? { operator: { connect: { id: event.operatorId } } } : {}),
    });

    if (event.operatorId) {
      await this.prisma.user
        .update({
          where: { id: event.operatorId },
          data: { status: 'ON_CALL', statusChangedAt: new Date() },
        })
        .catch(() => undefined);
    }
    return event.operatorId ?? this.operatorOfCall(event.callId);
  }

  private async onHeld(
    event: Extract<AiccEvent, { type: 'call.held' }>,
  ): Promise<string | undefined> {
    await this.updateCall(event.callId, {
      state: event.on ? 'HELD' : 'ANSWERED',
      ...(event.on ? { holdCount: { increment: 1 } } : {}),
    });
    return this.operatorOfCall(event.callId);
  }

  private async onTransferred(
    event: Extract<AiccEvent, { type: 'call.transferred' }>,
  ): Promise<string | undefined> {
    await this.updateCall(event.callId, { state: 'TRANSFERRING' });
    return this.operatorOfCall(event.callId);
  }

  private async onStateChanged(
    event: Extract<AiccEvent, { type: 'call.state_changed' }>,
  ): Promise<string | undefined> {
    await this.updateCall(event.callId, { state: event.to });
    return this.operatorOfCall(event.callId);
  }

  private async onEnded(
    event: Extract<AiccEvent, { type: 'call.ended' }>,
  ): Promise<string | undefined> {
    const call = await this.prisma.call.findUnique({
      where: { id: event.callId },
      select: {
        id: true,
        operatorId: true,
        contactId: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
      },
    });
    if (!call) {
      this.logger.warn(`call.ended uchun yozuv topilmadi: ${event.callId}`);
      return undefined;
    }

    await this.prisma.call.update({
      where: { id: event.callId },
      data: {
        state: event.disposition === 'FAILED' ? 'FAILED' : 'ENDED',
        disposition: event.disposition,
        endedAt: new Date(event.occurredAt),
        durationSec: event.durationSec,
        talkTimeSec: event.talkTimeSec,
        waitTimeSec: Math.max(0, event.durationSec - event.talkTimeSec),
      },
    });

    // Mijoz kartochkasidagi yagona lentaga yozuv qo'shiladi.
    if (call.contactId) {
      await this.prisma.activity.create({
        data: {
          tenantId: event.tenantId,
          kind: 'CALL',
          contactId: call.contactId,
          callId: call.id,
          actorId: call.operatorId,
          title:
            call.direction === 'INBOUND'
              ? `Kiruvchi qo'ng'iroq (${event.disposition})`
              : `Chiquvchi qo'ng'iroq (${event.disposition})`,
          body: `${call.fromNumber} -> ${call.toNumber}, ${event.durationSec} soniya`,
          metadata: { disposition: event.disposition, talkTimeSec: event.talkTimeSec },
          occurredAt: new Date(event.occurredAt),
        },
      });
    }

    // Operatorni "qo'ng'iroqdan keyingi ish" holatiga o'tkazamiz.
    if (call.operatorId) {
      await this.prisma.user
        .updateMany({
          where: { id: call.operatorId, status: 'ON_CALL' },
          data: { status: 'AFTER_CALL_WORK', statusChangedAt: new Date() },
        })
        .catch(() => undefined);
    }

    return call.operatorId ?? undefined;
  }

  private async updateCall(callId: string, data: Prisma.CallUpdateInput): Promise<void> {
    await this.prisma.call.update({ where: { id: callId }, data }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // Hodisa qo'ng'iroq yozuvidan oldin kelgan — keyingi hodisa to'g'rilaydi.
        this.logger.debug(`Yangilash uchun qo'ng'iroq topilmadi: ${callId}`);
        return;
      }
      throw error;
    });
  }

  private async operatorOfCall(callId: string): Promise<string | undefined> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { operatorId: true },
    });
    return call?.operatorId ?? undefined;
  }
}
