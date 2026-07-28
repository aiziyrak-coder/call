import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONSUMER_GROUPS, REDIS_STREAMS, aiccEventSchema, AiccEvent } from '@aicc/shared';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CallProjectionService } from '../calls/call-projection.service';
import { RecordingsService } from '../recordings/recordings.service';
import { TranscriptsService } from '../transcripts/transcripts.service';

const CONSUMER_NAME = `api-${process.pid}`;
const BLOCK_MS = 5_000;
const BATCH_SIZE = 50;

/**
 * Redis Stream'dan hodisalarni o'qib bazaga proyeksiya qiladi va brauzerga
 * uzatadi. Consumer group ishlatilgani uchun bir nechta API nusxasi ishlaganda
 * ham har bir hodisa faqat bir marta qayta ishlanadi.
 */
@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private client?: Redis;
  private running = false;

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: RealtimeGateway,
    private readonly projection: CallProjectionService,
    private readonly recordings: RecordingsService,
    private readonly transcripts: TranscriptsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const streams = [
      REDIS_STREAMS.telephony,
      REDIS_STREAMS.sms,
      REDIS_STREAMS.device,
      REDIS_STREAMS.ai,
    ];
    for (const stream of streams) {
      await this.redis.ensureGroup(stream, CONSUMER_GROUPS.api);
    }

    this.client = this.redis.createBlockingClient();
    this.running = true;
    void this.loop(streams);
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(streams: string[]): Promise<void> {
    const client = this.client;
    if (!client) return;

    // `>` — guruhga hali yetkazilmagan yangi xabarlar.
    const args = [...streams, ...streams.map(() => '>')];

    while (this.running) {
      try {
        const response = (await client.xreadgroup(
          'GROUP',
          CONSUMER_GROUPS.api,
          CONSUMER_NAME,
          'COUNT',
          BATCH_SIZE,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          ...args,
        )) as [string, [string, string[]][]][] | null;

        if (!response) continue;

        for (const [stream, entries] of response) {
          for (const [messageId, fields] of entries) {
            await this.handleEntry(stream, messageId, fields);
          }
        }
      } catch (error) {
        if (!this.running) return;
        this.logger.error(
          `Stream o'qishda xato: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Redis qayta ishga tushayotgan bo'lishi mumkin — qisqa pauza.
        await new Promise((done) => setTimeout(done, 1_000));
      }
    }
  }

  private async handleEntry(stream: string, messageId: string, fields: string[]): Promise<void> {
    const payloadIndex = fields.indexOf('payload');
    const raw = payloadIndex >= 0 ? fields[payloadIndex + 1] : undefined;

    // Qayta ishlab bo'lmaydigan xabar navbatni to'sib qo'ymasligi uchun
    // baribir ACK qilinadi, lekin log'da qoladi.
    if (!raw) {
      this.logger.warn(`Bo'sh hodisa (${stream}/${messageId})`);
      await this.ack(stream, messageId);
      return;
    }

    let event: AiccEvent;
    try {
      event = aiccEventSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error(
        `Hodisa sxemaga mos emas (${stream}/${messageId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.ack(stream, messageId);
      return;
    }

    try {
      const operatorId = await this.projection.apply(event);

      // Asterisk faylni yozib bo'lgach, uni shifrlab obyekt xotirasiga ko'chiramiz.
      if (event.type === 'recording.ready') {
        await this.recordings.ingest({
          tenantId: event.tenantId,
          callId: event.callId,
          fileName: event.objectKey,
          durationSec: event.durationSec,
        });
      }

      // Faqat yakuniy segmentlar saqlanadi; partial natijalar tez o'zgaradi.
      if (event.type === 'transcript.final') {
        await this.transcripts.appendSegment(event);
      }

      // OpenAI xulosasi — Transcript.summary maydoniga yoziladi.
      if (event.type === 'ai.summary') {
        await this.transcripts.saveSummary(event);
      }

      this.gateway.emitEvent(event, operatorId);
    } catch (error) {
      this.logger.error(
        `Hodisani qayta ishlab bo'lmadi (${event.type}): ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await this.ack(stream, messageId);
    }
  }

  private async ack(stream: string, messageId: string): Promise<void> {
    await this.redis.client
      .xack(stream, CONSUMER_GROUPS.api, messageId)
      .catch((error: Error) => this.logger.error(`ACK xatosi: ${error.message}`));
  }
}
