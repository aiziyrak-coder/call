import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

/** Audit yozuvidan olib tashlanadigan maydonlar. */
const REDACTED_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'mfaToken',
  'code',
  'secret',
  'twoFactorSecret',
  'sipPassword',
  'authToken',
  'enrollmentSecret',
  'deviceToken',
  'authorization',
  'Authorization',
  'OPENAI_API_KEY',
  'token',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : redact(item, depth + 1);
  }
  return result;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;

    const write = (success: boolean, resourceId?: string) => {
      // Audit yozuvi asosiy so'rovni bloklamasligi kerak.
      const tenantId = user?.tenantId ?? (req.body as { tenantId?: string })?.tenantId;
      if (!tenantId) return;

      void this.prisma.auditLog
        .create({
          data: {
            tenantId,
            userId: user?.id ?? null,
            action: meta.action,
            resource: meta.resource,
            resourceId: resourceId ?? (req.params as Record<string, string>)?.id ?? null,
            changes: redact({ body: req.body, query: req.query }) as object,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
            success,
          },
        })
        .catch((error: Error) => this.logger.error(`Audit yozib bo'lmadi: ${error.message}`));
    };

    return next.handle().pipe(
      tap((result: unknown) => {
        const id =
          result && typeof result === 'object' && 'id' in result
            ? String((result as { id: unknown }).id)
            : undefined;
        write(true, id);
      }),
      catchError((error: unknown) => {
        write(false);
        return throwError(() => error);
      }),
    );
  }
}
