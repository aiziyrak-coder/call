import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-auth CSRF himoyasi: o'zgartiruvchi so'rovlarda Origin/Referer
 * CORS_ORIGINS ro'yxatida bo'lishi shart (yoki Origin umuman yo'q — same-origin
 * navigatsiya emas, server-to-server Bearer).
 */
@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService) {
    this.allowed = new Set(
      config
        .get<string>('CORS_ORIGINS', 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE.has(req.method.toUpperCase())) {
      next();
      return;
    }

    // Bearer-only (ichki/mobile) — Origin tekshiruvi majburiy emas.
    const auth = req.get('authorization');
    if (auth?.toLowerCase().startsWith('bearer ') && !req.cookies?.aicc_access) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin) {
      if (!this.allowed.has(origin)) {
        throw new ForbiddenException('Origin ruxsat etilmagan');
      }
      next();
      return;
    }

    const referer = req.get('referer');
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (this.allowed.has(refOrigin)) {
          next();
          return;
        }
      } catch {
        /* ignore */
      }
      throw new ForbiddenException('Referer ruxsat etilmagan');
    }

    // Cookie bilan kelgan, Origin/Referer yo'q — shubhali (eski brauzerlar / CSRF).
    if (req.cookies?.aicc_access || req.cookies?.aicc_refresh) {
      throw new ForbiddenException('Origin talab qilinadi');
    }

    next();
  }
}
