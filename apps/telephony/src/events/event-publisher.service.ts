import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_STREAMS, AiccEvent } from '@aicc/shared';

/**
 * Oddiy `Omit` diskriminatsiyalangan birlashmani buzadi — u faqat umumiy
 * maydonlarni qoldiradi. Shu sababli birlashmaning har bir a'zosi alohida
 * qayta ishlanadi.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type EventInput = DistributiveOmit<AiccEvent, 'eventId' | 'occurredAt'> & {
  eventId?: string;
  occurredAt?: string;
};

/**
 * Hodisalarni Redis Stream ga yozadi. Core API ularni consumer group orqali
 * o'qib bazaga saqlaydi va brauzerga Socket.IO bilan uzatadi.
 */
@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.redis.on('error', (error) => this.logger.error(`Redis xatosi: ${error.message}`));
  }

  async publish(event: EventInput, stream: string = REDIS_STREAMS.telephony): Promise<void> {
    const payload: AiccEvent = {
      ...event,
      eventId: event.eventId ?? randomUUID(),
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    } as AiccEvent;

    try {
      await this.redis.xadd(stream, 'MAXLEN', '~', 10_000, '*', 'payload', JSON.stringify(payload));
    } catch (error) {
      // Hodisa yo'qolsa ham qo'ng'iroqning o'zi uzilmasligi kerak.
      this.logger.error(
        `Hodisani nashr qilib bo'lmadi (${payload.type}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** AudioSocket UUID -> qo'ng'iroq bog'lanishi (ai-worker shu yerdan o'qiydi). */
  async setKey(key: string, value: unknown, ttlSec: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  }

  async deleteKey(key: string): Promise<void> {
    await this.redis.del(key).catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
