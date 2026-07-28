import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import type { SttChunk, SttProvider, SttSession, SttSessionOptions } from '@aicc/shared';

/**
 * GigaAM v3 (rus tili uchun asosiy model) WebSocket streaming mijozi.
 * Server protokoli: birinchi xabar JSON konfiguratsiya, keyin xom PCM freymlar;
 * javoblar JSON — `{ text, is_final, start_ms, end_ms, confidence }`.
 */
@Injectable()
export class GigaAmSttProvider implements SttProvider {
  readonly name = 'gigaam';
  readonly supportedLanguages = ['ru'] as const;

  private readonly logger = new Logger(GigaAmSttProvider.name);
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('STT_WS_URL', 'ws://localhost:9876/v1/ws');
  }

  async open(options: SttSessionOptions, onChunk: (chunk: SttChunk) => void): Promise<SttSession> {
    const socket = new WebSocket(this.url);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('STT ulanish vaqti tugadi')), 10_000);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    socket.send(
      JSON.stringify({
        type: 'config',
        language: options.language,
        sample_rate: options.sampleRate,
        encoding: 'pcm_s16le',
        interim_results: true,
        session_id: `${options.callId}:${options.speaker}`,
      }),
    );

    socket.on('message', (data: WebSocket.RawData) => {
      const chunk = this.parse(data, options);
      if (chunk) onChunk(chunk);
    });

    socket.on('error', (error: Error) =>
      this.logger.warn(`STT soketi xatosi (${options.callId}): ${error.message}`),
    );

    return {
      pushAudio: (pcm: Uint8Array) => {
        // Model orqada qolsa bufer o'sib ketmasligi uchun freym tashlab ketiladi.
        if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1_000_000) return;
        socket.send(pcm);
      },
      close: async () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'eof' }));
          socket.close();
        }
      },
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    return new Promise((resolve) => {
      const socket = new WebSocket(this.url);
      const finish = (healthy: boolean, detail?: string) => {
        socket.removeAllListeners();
        socket.close();
        resolve({ healthy, detail });
      };

      const timer = setTimeout(() => finish(false, 'timeout'), 5_000);
      socket.once('open', () => {
        clearTimeout(timer);
        finish(true, this.url);
      });
      socket.once('error', (error: Error) => {
        clearTimeout(timer);
        finish(false, error.message);
      });
    });
  }

  private parse(data: WebSocket.RawData, options: SttSessionOptions): SttChunk | null {
    try {
      const message = JSON.parse(data.toString()) as {
        text?: string;
        is_final?: boolean;
        start_ms?: number;
        end_ms?: number;
        confidence?: number;
      };

      if (!message.text) return null;

      return {
        speaker: options.speaker,
        text: message.text,
        isFinal: message.is_final ?? false,
        startMs: message.start_ms ?? 0,
        endMs: message.end_ms ?? message.start_ms ?? 0,
        confidence: message.confidence,
      };
    } catch {
      // Model ba'zan binar keep-alive yuboradi — bunday xabarlar e'tiborsiz qoldiriladi.
      return null;
    }
  }
}
