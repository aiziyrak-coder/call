import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const FAIL_PREFIX = 'aicc:auth:fail:';
const LOCK_PREFIX = 'aicc:auth:lock:';
const IP_FAIL_PREFIX = 'aicc:auth:ipfail:';
const IP_LOCK_PREFIX = 'aicc:auth:iplock:';
const MAX_FAILURES = 5;
const MAX_IP_FAILURES = 30;
const WINDOW_SEC = 15 * 60;
const LOCK_SEC = 30 * 60;
const IP_LOCK_SEC = 15 * 60;

/**
 * Login brute-force himoyasi:
 * - email: 5 muvaffaqiyatsiz → 30 daqiqa blok
 * - IP: 30 muvaffaqiyatsiz (turli email) → 15 daqiqa blok (account lockout DoS ni yumshatadi)
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private key(email: string): string {
    return email.toLowerCase().trim();
  }

  async assertNotLocked(email: string, ip?: string): Promise<void> {
    if (ip) {
      const ipLocked = await this.redis.client.get(`${IP_LOCK_PREFIX}${ip}`);
      if (ipLocked) {
        throw new UnauthorizedException(
          'IP vaqtincha bloklangan. Keyinroq qayta urinib ko\'ring',
        );
      }
    }
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

    if (ip) {
      const ipKey = `${IP_FAIL_PREFIX}${ip}`;
      const ipCount = await this.redis.client.incr(ipKey);
      if (ipCount === 1) await this.redis.client.expire(ipKey, WINDOW_SEC);
      if (ipCount >= MAX_IP_FAILURES) {
        await this.redis.client.set(`${IP_LOCK_PREFIX}${ip}`, '1', 'EX', IP_LOCK_SEC);
        await this.redis.client.del(ipKey);
        this.logger.warn(`IP bloklandi: ${ip} (${MAX_IP_FAILURES} marta xato)`);
      }
    }
  }

  async clear(email: string): Promise<void> {
    const k = this.key(email);
    await this.redis.client.del(`${FAIL_PREFIX}${k}`, `${LOCK_PREFIX}${k}`);
  }
}
