import { createServer, type Server, type Socket } from 'node:net';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mediaForkKey, type MediaForkBinding, type SttSession } from '@aicc/shared';
import { AUDIOSOCKET_TYPE, AudioSocketParser, decodeUuid } from './audiosocket.protocol';
import { RedisService } from '../redis/redis.service';
import { TranscriptPublisher } from '../transcripts/transcript-publisher.service';
import { SttRegistry } from '../stt/stt.registry';

interface ForkConnection {
  binding: MediaForkBinding;
  stt: SttSession | null;
  /** Ulanish boshlanganidan beri qabul qilingan baytlar — vaqt shundan hisoblanadi. */
  bytesReceived: number;
}

@Injectable()
export class AudioSocketServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AudioSocketServer.name);
  private readonly port: number;
  private server?: Server;
  private readonly connections = new Map<Socket, ForkConnection>();

  constructor(
    private readonly redis: RedisService,
    private readonly stt: SttRegistry,
    private readonly publisher: TranscriptPublisher,
    config: ConfigService,
  ) {
    this.port = Number(config.get('AUDIOSOCKET_PORT', 8090));
  }

  onModuleInit(): void {
    this.server = createServer((socket) => this.handleConnection(socket));
    this.server.on('error', (error) => this.logger.error(`AudioSocket xatosi: ${error.message}`));
    this.server.listen(this.port, () =>
      this.logger.log(`AudioSocket tinglamoqda: 0.0.0.0:${this.port}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const [socket, connection] of this.connections) {
      await connection.stt?.close().catch(() => undefined);
      socket.destroy();
    }
    this.connections.clear();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  get activeForks(): number {
    return this.connections.size;
  }

  private handleConnection(socket: Socket): void {
    // Audio kichik freymlar bilan keladi — Nagle algoritmi kechikish qo'shadi.
    socket.setNoDelay(true);
    const parser = new AudioSocketParser();

    socket.on('data', (chunk: Buffer) => {
      for (const frame of parser.push(chunk)) {
        void this.handleFrame(socket, frame.type, frame.payload).catch((error: Error) =>
          this.logger.error(`Freym xatosi: ${error.message}`),
        );
      }
    });

    socket.on('close', () => void this.closeConnection(socket));
    socket.on('error', (error) => {
      this.logger.warn(`Ulanish uzildi: ${error.message}`);
      void this.closeConnection(socket);
    });
  }

  private async handleFrame(socket: Socket, type: number, payload: Buffer): Promise<void> {
    switch (type) {
      case AUDIOSOCKET_TYPE.uuid:
        await this.bind(socket, decodeUuid(payload));
        break;

      case AUDIOSOCKET_TYPE.audio: {
        const connection = this.connections.get(socket);
        if (!connection?.stt) return;
        connection.bytesReceived += payload.length;
        connection.stt.pushAudio(payload);
        break;
      }

      case AUDIOSOCKET_TYPE.terminate:
        await this.closeConnection(socket);
        socket.end();
        break;

      case AUDIOSOCKET_TYPE.error:
        this.logger.warn(`Asterisk xato freymi: ${payload.toString('hex')}`);
        break;

      default:
        this.logger.debug(`Noma'lum freym turi 0x${type.toString(16)}`);
    }
  }

  /** UUID -> qo'ng'iroq bog'lanishi Redis dan olinadi va STT sessiyasi ochiladi. */
  private async bind(socket: Socket, uuid: string): Promise<void> {
    const binding = await this.redis.getJson<MediaForkBinding>(mediaForkKey(uuid));
    if (!binding) {
      this.logger.warn(`Noma'lum media fork: ${uuid}`);
      socket.end();
      return;
    }

    const connection: ForkConnection = { binding, stt: null, bytesReceived: 0 };
    this.connections.set(socket, connection);

    try {
      connection.stt = await this.stt.get(binding.language).open(
        {
          callId: binding.callId,
          language: binding.language,
          sampleRate: binding.sampleRate,
          speaker: binding.speaker,
        },
        (chunk) => void this.publisher.publish(binding, chunk),
      );

      this.logger.log(
        `Media fork ulandi: call=${binding.callId} speaker=${binding.speaker} uuid=${uuid}`,
      );
    } catch (error) {
      // STT ishlamasa ham qo'ng'iroq davom etadi — faqat transkripsiya bo'lmaydi.
      this.logger.error(
        `STT sessiyasi ochilmadi (call=${binding.callId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      socket.end();
    }
  }

  private async closeConnection(socket: Socket): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;

    this.connections.delete(socket);
    await connection.stt?.close().catch(() => undefined);
    this.logger.log(
      `Media fork yopildi: call=${connection.binding.callId} (${Math.round(connection.bytesReceived / 32000)}s audio)`,
    );
  }
}
