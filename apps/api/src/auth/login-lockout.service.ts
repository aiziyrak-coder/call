import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const FAIL_PREFIX = 'aicc:auth:fail:';
const LOCK_PREFIX = 'aicc:auth:lock:';
const MAX_FAILURES = 5;
const WINDOW_SEC = 15 * 60;
const LOCK_SEC = 30 * 60;

/**
 * Login brute-force himoyasi: 5 muvaffaqiyatsiz urinishdan keyin 30 daqiqa blok.
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private key(email: string): string {
    return email.toLowerCase().trim();
  }

  async assertNotLocked(email: string): Promise<void> {
    const locked = await this.redis.client.get(`${LOCK_PREFIX}${this.key(email)}`);
    if (locked) {
      throw new UnauthorizedException(
        'Hisob vaqtincha bloklangan. 30 daqiqadan keyin qayta urinib ko\'ring',
      );
    }
  }

  async recordFailure(email: string, ip?: string): Promise<void> {
    const k = this.key(email);
    const failKey = `${FAIL_PREFIX}${k}`;
    const count = await this.redis.client.incr(failKey);
    if (count === 1) await this.redis.client.expire(failKey, WINDOW_SEC);

    this.logger.warn(`Login muvaffaqiyatsiz: ${k} (urinish=${count}, ip=${ip ?? 'noma\'lum'})`);

    if (count >= MAX_FAILURES) {
      await this.redis.client.set(`${LOCK_PREFIX}${k}`, '1', 'EX', LOCK_SEC);
      await this.redis.client.del(failKey);
      this.logger.warn(`Hisob bloklandi: ${k} (${MAX_FAILURES} marta xato)`);
    }
  }

  async clear(email: string): Promise<void> {
    const k = this.key(email);
    await this.redis.client.del(`${FAIL_PREFIX}${k}`, `${LOCK_PREFIX}${k}`);
  }
}
