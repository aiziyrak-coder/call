import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONSUMER_GROUPS, REDIS_STREAMS, aiccEventSchema } from '@aicc/shared';
import { RedisService } from '../redis/redis.service';
import { OpenAiLlmService } from '../llm/openai-llm.service';

/**
 * Qo'ng'iroq tugashi (`call.ended`) ni eshitib OpenAI bilan xulosa yaratadi.
 */
@Injectable()
export class CallEndedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallEndedConsumer.name);
  private client?: Redis;
  private running = false;

  constructor(
    private readonly redis: RedisService,
    private readonly llm: OpenAiLlmService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.client.xgroup(
      'CREATE',
      REDIS_STREAMS.telephony,
      CONSUMER_GROUPS.aiWorker,
      '$',
      'MKSTREAM',
    ).catch((error: Error & { message?: string }) => {
      if (!String(error.message).includes('BUSYGROUP')) {
        this.logger.warn(`Guruh yaratish: ${error.message}`);
      }
    });

    this.client = this.redis.client.duplicate();
    this.running = true;
    void this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.client?.quit().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    const client = this.client;
    if (!client) return;

    while (this.running) {
      try {
        const response = (await client.xreadgroup(
          'GROUP',
          CONSUMER_GROUPS.aiWorker,
          `ai-${process.pid}`,
          'COUNT',
          20,
          'BLOCK',
          5_000,
          'STREAMS',
          REDIS_STREAMS.telephony,
          '>',
        )) as [string, [string, string[]][]][] | null;

        if (!response) continue;

        for (const [, entries] of response) {
          for (const [messageId, fields] of entries) {
            await this.handle(messageId, fields);
          }
        }
      } catch (error) {
        if (!this.running) return;
        this.logger.error(
          `call.ended o'qish xatosi: ${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((done) => setTimeout(done, 1_000));
      }
    }
  }

  private async handle(messageId: string, fields: string[]): Promise<void> {
    const payloadIndex = fields.indexOf('payload');
    const raw = payloadIndex >= 0 ? fields[payloadIndex + 1] : undefined;
    try {
      if (raw) {
        const event = aiccEventSchema.parse(JSON.parse(raw));
        if (event.type === 'call.ended') {
          await this.llm.summarizeCall({ callId: event.callId, tenantId: event.tenantId });
        }
      }
    } catch (error) {
      this.logger.debug(
        `Hodisa o'tkazib yuborildi: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await this.redis.client.xack(REDIS_STREAMS.telephony, CONSUMER_GROUPS.aiWorker, messageId);
    }
  }
}
