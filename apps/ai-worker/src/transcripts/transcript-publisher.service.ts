import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { REDIS_STREAMS, type AiccEvent, type MediaForkBinding, type SttChunk } from '@aicc/shared';
import { RedisService } from '../redis/redis.service';
import { OpenAiLlmService } from '../llm/openai-llm.service';

/**
 * STT natijalarini `aicc:stream:ai` ga yozadi va OpenAI LLM tahlilini boshlaydi.
 */
@Injectable()
export class TranscriptPublisher {
  private readonly logger = new Logger(TranscriptPublisher.name);

  constructor(
    private readonly redis: RedisService,
    private readonly llm: OpenAiLlmService,
  ) {}

  async publish(binding: MediaForkBinding, chunk: SttChunk): Promise<void> {
    const text = chunk.text.trim();
    if (!text) return;

    const event: AiccEvent = chunk.isFinal
      ? {
          type: 'transcript.final',
          eventId: randomUUID(),
          tenantId: binding.tenantId,
          occurredAt: new Date().toISOString(),
          callId: binding.callId,
          speaker: chunk.speaker,
          text,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          confidence: chunk.confidence,
        }
      : {
          type: 'transcript.partial',
          eventId: randomUUID(),
          tenantId: binding.tenantId,
          occurredAt: new Date().toISOString(),
          callId: binding.callId,
          speaker: chunk.speaker,
          text,
          startMs: chunk.startMs,
        };

    try {
      await this.redis.client.xadd(
        REDIS_STREAMS.ai,
        'MAXLEN',
        '~',
        50_000,
        '*',
        'payload',
        JSON.stringify(event),
      );

      // Sentiment / tavsiya — faqat yakuniy segmentlarda (tez-tez so'rov yubormaslik).
      if (chunk.isFinal) {
        void this.llm.onTranscript(binding, chunk);
      }
    } catch (error) {
      this.logger.error(
        `Transkript nashr qilinmadi (${binding.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
