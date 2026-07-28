import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Permission } from '@aicc/shared';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'aicc:isPublic';
/** Endpoint autentifikatsiyasiz ochiq bo'lsin. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'aicc:permissions';
/** Ko'rsatilgan huquflarning kamida bittasi bo'lishi shart. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const AUDIT_KEY = 'aicc:audit';
export interface AuditMeta {
  action: string;
  resource: string;
}
/** Muvaffaqiyatli va xato so'rovlarni audit-jurnalga yozadi. */
export const Audit = (action: string, resource: string) =>
  SetMetadata(AUDIT_KEY, { action, resource } satisfies AuditMeta);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
