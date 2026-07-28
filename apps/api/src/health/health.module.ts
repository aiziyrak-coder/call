import { Controller, Get, HttpStatus, Module, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [databaseOk, cacheOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client.ping().then(() => true).catch(() => false),
    ]);

    const healthy = databaseOk && cacheOk;
    if (!healthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      checks: this.isDetail
        ? {
            database: databaseOk ? 'ok' : 'fail',
            cache: cacheOk ? 'ok' : 'fail',
          }
        : undefined,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private get isDetail(): boolean {
    return process.env.NODE_ENV !== 'production';
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
