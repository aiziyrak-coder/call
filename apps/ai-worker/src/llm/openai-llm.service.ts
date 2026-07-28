import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REDIS_STREAMS,
  type AiccEvent,
  type MediaForkBinding,
  type SttChunk,
} from '@aicc/shared';
import { RedisService } from '../redis/redis.service';

interface AnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry' | 'uncertain';
  score: number;
  label: string;
  title: string;
  detail: string;
  suggestedReply?: string;
}

/**
 * GPT orqali real-time sentiment + next-best-action va suhbat yakunida xulosa.
 * Barcha so'rovlar OpenAI Chat Completions orqali boradi.
 */
@Injectable()
export class OpenAiLlmService {
  private readonly logger = new Logger(OpenAiLlmService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  /** Har bir qo'ng'iroq uchun so'nggi N segment — kontekst. */
  private readonly history = new Map<string, Array<{ speaker: string; text: string }>>();

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.model = config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o-mini');
    this.baseUrl = config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  }

  /** Yangi yakuniy segment kelganda tahlil qiladi va hodisa nashr qiladi. */
  async onTranscript(binding: MediaForkBinding, chunk: SttChunk): Promise<void> {
    if (!this.apiKey || !chunk.isFinal || !chunk.text.trim()) return;

    const lines = this.history.get(binding.callId) ?? [];
    lines.push({ speaker: chunk.speaker, text: chunk.text.trim() });
    if (lines.length > 24) lines.splice(0, lines.length - 24);
    this.history.set(binding.callId, lines);

    try {
      const analysis = await this.analyze(lines);
      await this.publish({
        type: 'ai.sentiment',
        eventId: randomUUID(),
        tenantId: binding.tenantId,
        occurredAt: new Date().toISOString(),
        callId: binding.callId,
        sentiment: analysis.sentiment,
        score: analysis.score,
        label: analysis.label,
      });
      await this.publish({
        type: 'ai.recommendation',
        eventId: randomUUID(),
        tenantId: binding.tenantId,
        occurredAt: new Date().toISOString(),
        callId: binding.callId,
        title: analysis.title,
        detail: analysis.detail,
        suggestedReply: analysis.suggestedReply,
      });
    } catch (error) {
      this.logger.warn(
        `LLM tahlili muvaffaqiyatsiz (${binding.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Qo'ng'iroq tugagach qisqa xulosa va QA ball. */
  async summarizeCall(params: {
    callId: string;
    tenantId: string;
  }): Promise<void> {
    if (!this.apiKey) return;
    const lines = this.history.get(params.callId) ?? [];
    if (lines.length === 0) return;

    try {
      const result = await this.chat(
        `Siz call-markaz sifat nazoratchisisiz. Quyidagi suhbat matnidan o'zbek tilida
3-5 jumlalik xulosa va 0-100 oralig'ida sifat balli (qaScore) bering.
Javob faqat JSON: {"summary":"...","qaScore":85}`,
        lines.map((line) => `${line.speaker}: ${line.text}`).join('\n'),
      );

      const parsed = JSON.parse(extractJson(result)) as { summary?: string; qaScore?: number };
      if (!parsed.summary) return;

      await this.publish({
        type: 'ai.summary',
        eventId: randomUUID(),
        tenantId: params.tenantId,
        occurredAt: new Date().toISOString(),
        callId: params.callId,
        summary: parsed.summary,
        qaScore: parsed.qaScore,
      });
    } catch (error) {
      this.logger.warn(
        `Xulosa yaratilmadi (${params.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.history.delete(params.callId);
    }
  }

  clear(callId: string): void {
    this.history.delete(callId);
  }

  private async analyze(lines: Array<{ speaker: string; text: string }>): Promise<AnalysisResult> {
    const transcript = lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
    const raw = await this.chat(
      `Siz O'zbekiston call-markazi AI yordamchisisiz. Operatorga real vaqtda yordam berasiz.
Javob FAQAT JSON (o'zbek tilida matnlar):
{
  "sentiment": "positive|neutral|negative|angry|uncertain",
  "score": 0.0-1.0,
  "label": "qisqa kayfiyat yorlig'i",
  "title": "keyingi eng yaxshi harakat sarlavhasi",
  "detail": "1-2 jumla tavsiya",
  "suggestedReply": "operator aytishi mumkin bo'lgan gap"
}`,
      transcript,
    );

    const parsed = JSON.parse(extractJson(raw)) as Partial<AnalysisResult>;
    return {
      sentiment: parsed.sentiment ?? 'neutral',
      score: clamp(Number(parsed.score ?? 0.5)),
      label: parsed.label ?? 'Neytral',
      title: parsed.title ?? 'Davom eting',
      detail: parsed.detail ?? 'Mijozni diqqat bilan tinglang.',
      suggestedReply: parsed.suggestedReply,
    };
  }

  private async chat(system: string, user: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '{}';
  }

  private async publish(event: AiccEvent): Promise<void> {
    await this.redis.client.xadd(
      REDIS_STREAMS.ai,
      'MAXLEN',
      '~',
      50_000,
      '*',
      'payload',
      JSON.stringify(event),
    );
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
