import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SttChunk, SttProvider, SttSession, SttSessionOptions } from '@aicc/shared';

/**
 * OpenAI Whisper / gpt-4o-transcribe.
 * AudioSocket dan kelgan PCM16 ni ~2.5 s buferlab WAV qilib
 * `/v1/audio/transcriptions` ga yuboradi — alohida STT server kerak emas.
 */
@Injectable()
export class OpenAiWhisperSttProvider implements SttProvider {
  readonly name = 'openai';
  readonly supportedLanguages = ['ru', 'uz', 'en', 'auto'] as const;

  private readonly logger = new Logger(OpenAiWhisperSttProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.model = config.get<string>('OPENAI_STT_MODEL', 'gpt-4o-mini-transcribe');
    this.baseUrl = config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  }

  async open(
    options: SttSessionOptions,
    onChunk: (chunk: SttChunk) => void,
  ): Promise<SttSession> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY berilmagan');
    }

    const sampleRate = options.sampleRate;
    // 16 kHz da 2.5 s ≈ 80_000 bayt; 8 kHz da ~40_000.
    const flushBytes = Math.round(sampleRate * 2 * 2.5);
    const silenceRms = 180; // past energiya — bo'sh bo'laklarni yubormaymiz
    let buffer = Buffer.alloc(0);
    let startMs = 0;
    let closed = false;
    let inflight: Promise<void> = Promise.resolve();

    const flush = (force = false) => {
      if (buffer.length < (force ? sampleRate : flushBytes)) return;
      const pcm = buffer;
      buffer = Buffer.alloc(0);
      const chunkStart = startMs;
      const durationMs = Math.round((pcm.length / 2 / sampleRate) * 1000);
      startMs += durationMs;

      if (rms(pcm) < silenceRms) return;

      inflight = inflight
        .then(async () => {
          if (closed) return;
          const text = await this.transcribe(pcm, sampleRate, options.language);
          if (!text || closed) return;

          onChunk({
            speaker: options.speaker,
            text,
            isFinal: true,
            startMs: chunkStart,
            endMs: chunkStart + durationMs,
            confidence: 0.9,
          });
        })
        .catch((error: Error) => {
          this.logger.warn(`Whisper xatosi (${options.callId}): ${error.message}`);
        });
    };

    return {
      pushAudio: (pcm: Uint8Array) => {
        if (closed) return;
        buffer = Buffer.concat([buffer, Buffer.from(pcm)]);
        if (buffer.length >= flushBytes) flush();
      },
      close: async () => {
        closed = true;
        flush(true);
        await inflight;
      },
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    if (!this.apiKey) return { healthy: false, detail: 'OPENAI_API_KEY yo\'q' };
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return { healthy: false, detail: `HTTP ${response.status}` };
      return { healthy: true, detail: this.model };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async transcribe(pcm: Buffer, sampleRate: number, language: string): Promise<string> {
    const wav = pcm16ToWav(pcm, sampleRate);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'chunk.wav');
    form.append('model', this.model);
    form.append('response_format', 'json');
    if (language && language !== 'auto') {
      // OpenAI til kodlari: ru, en; uz to'g'ridan-to'g'ri qo'llab-quvvatlanmasa auto.
      form.append('language', language === 'uz' ? 'ru' : language);
    }

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as { text?: string };
    return (data.text ?? '').trim();
  }
}

function rms(pcm: Buffer): number {
  if (pcm.length < 2) return 0;
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i += 1) {
    const sample = pcm.readInt16LE(i * 2);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

/** Minimal RIFF/WAV sarlavhasi — Whisper fayl kutadi. */
function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
