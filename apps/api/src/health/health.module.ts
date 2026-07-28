import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  async check() {
    const [database, cache] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`
        .then(() => 'ok' as const)
        .catch((error: Error) => `xato: ${error.message}`),
      this.redis.client
        .ping()
        .then(() => 'ok' as const)
        .catch((error: Error) => `xato: ${error.message}`),
    ]);

    const healthy = database === 'ok' && cache === 'ok';
    return {
      status: healthy ? 'ok' : 'degraded',
      checks: { database, cache },
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
