import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import type { SttChunk, SttProvider, SttSession, SttSessionOptions } from '@aicc/shared';

/**
 * WhisperLive — ko'p tilli zaxira (o'zbek/ingliz uchun ham). Protokoli
 * GigaAM dan farq qiladi: birinchi xabar `uid` bilan handshake, javoblarda
 * `segments` massivi keladi.
 */
@Injectable()
export class WhisperLiveSttProvider implements SttProvider {
  readonly name = 'whisper-live';
  readonly supportedLanguages = ['ru', 'uz', 'en'] as const;

  private readonly logger = new Logger(WhisperLiveSttProvider.name);
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('WHISPER_WS_URL', 'ws://localhost:9090');
  }

  async open(options: SttSessionOptions, onChunk: (chunk: SttChunk) => void): Promise<SttSession> {
    const socket = new WebSocket(this.url);
    const uid = `${options.callId}:${options.speaker}`;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WhisperLive ulanmadi')), 10_000);
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
        uid,
        language: options.language,
        task: 'transcribe',
        model: 'small',
        use_vad: true,
      }),
    );

    let lastFinalEnd = 0;

    socket.on('message', (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString()) as {
          segments?: Array<{ start: string; end: string; text: string; completed?: boolean }>;
        };
        for (const segment of message.segments ?? []) {
          const startMs = Math.round(Number(segment.start) * 1000);
          const endMs = Math.round(Number(segment.end) * 1000);
          // Bir xil yakuniy segment qayta-qayta kelmasligi uchun filtr.
          if (segment.completed && endMs <= lastFinalEnd) continue;
          if (segment.completed) lastFinalEnd = endMs;

          onChunk({
            speaker: options.speaker,
            text: segment.text.trim(),
            isFinal: segment.completed ?? false,
            startMs,
            endMs,
          });
        }
      } catch {
        // Handshake javoblari matn ko'rinishida keladi — ular tashlab ketiladi.
      }
    });

    socket.on('error', (error: Error) =>
      this.logger.warn(`WhisperLive xatosi (${uid}): ${error.message}`),
    );

    return {
      pushAudio: (pcm: Uint8Array) => {
        if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1_000_000) return;
        // WhisperLive 32-bit float kutadi.
        socket.send(pcmToFloat32(pcm));
      },
      close: async () => {
        if (socket.readyState === WebSocket.OPEN) socket.close();
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
}

function pcmToFloat32(pcm: Uint8Array): Buffer {
  const samples = Math.floor(pcm.length / 2);
  const output = Buffer.alloc(samples * 4);
  const view = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  for (let i = 0; i < samples; i += 1) {
    output.writeFloatLE(view.readInt16LE(i * 2) / 32768, i * 4);
  }
  return output;
}
