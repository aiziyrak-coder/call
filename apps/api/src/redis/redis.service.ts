import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Bitta ulanish buyruqlar uchun, alohida ulanish esa bloklovchi stream o'qish
 * uchun ishlatiladi — `XREADGROUP BLOCK` ulanishni band qilib qo'yadi.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private readonly blockingClients: Redis[] = [];
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('REDIS_URL');
    this.client = new Redis(this.url, { maxRetriesPerRequest: null });
    this.client.on('error', (error) => this.logger.error(`Redis xatosi: ${error.message}`));
  }

  createBlockingClient(): Redis {
    const client = new Redis(this.url, { maxRetriesPerRequest: null });
    client.on('error', (error) => this.logger.error(`Redis (blocking) xatosi: ${error.message}`));
    this.blockingClients.push(client);
    return client;
  }

  /** Guruh mavjud bo'lmasa yaratadi; `BUSYGROUP` xatosi normal holat. */
  async ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await this.client.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) throw error;
    }
  }

  async publish(stream: string, payload: unknown, maxLen = 10_000): Promise<string> {
    return this.client.xadd(
      stream,
      'MAXLEN',
      '~',
      maxLen,
      '*',
      'payload',
      JSON.stringify(payload),
    ) as Promise<string>;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.client.quit(),
      ...this.blockingClients.map((client) => client.quit()),
    ]);
  }
}
