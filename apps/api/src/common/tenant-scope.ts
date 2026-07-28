import { ForbiddenException } from '@nestjs/common';
import { resolveScope, Role } from '@aicc/shared';

/**
 * `:own` / `:all` huquqlariga qarab Prisma `where` bo'lagini quradi.
 * Har bir so'rov majburan `tenantId` bilan cheklanadi — bu multi-tenant
 * ma'lumot chetga chiqishining oldini oladi.
 */
export function scopedWhere(
  user: { tenantId: string; id: string; roles: Role[] },
  resource: string,
  action: string,
  ownerField = 'ownerId',
): Record<string, unknown> {
  const scope = resolveScope(user.roles, resource, action);
  if (scope === 'none') {
    throw new ForbiddenException(`"${resource}" resursiga ruxsat yo'q`);
  }
  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (scope === 'own') where[ownerField] = user.id;
  return where;
}

export function assertSameTenant(user: { tenantId: string }, entity: { tenantId: string }): void {
  if (entity.tenantId !== user.tenantId) {
    throw new ForbiddenException("Boshqa tashkilot ma'lumotiga murojaat");
  }
}
