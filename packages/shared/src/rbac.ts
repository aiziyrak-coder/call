import { z } from 'zod';

/** TZ 2-bo'limidagi rollar. AI_AGENT - virtual operator (servis hisobi). */
export const ROLES = ['OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'AI_AGENT'] as const;

export const roleSchema = z.enum(ROLES);
export type Role = (typeof ROLES)[number];

/**
 * Huquqlar `resurs:harakat` ko'rinishida. `:own` qo'shimchasi faqat
 * foydalanuvchining o'z yozuvlariga tegishli ekanini bildiradi.
 */
export const PERMISSIONS = [
  'call:read:own',
  'call:read:all',
  'call:originate',
  'call:control',
  'call:listen',
  'call:whisper',
  'call:barge',
  'recording:read:own',
  'recording:read:all',
  'recording:delete',
  'contact:read:own',
  'contact:read:all',
  'contact:write',
  'contact:delete',
  'contact:import',
  'deal:read:own',
  'deal:read:all',
  'deal:write',
  'task:read:own',
  'task:read:all',
  'task:write',
  'sms:send',
  'sms:read:own',
  'sms:read:all',
  'sms:bulk',
  'qa:evaluate',
  'qa:read:own',
  'qa:read:all',
  'qa:appeal',
  'analytics:read:own',
  'analytics:read:all',
  'queue:manage',
  'ivr:manage',
  'script:manage',
  'knowledge:manage',
  'shift:manage',
  'user:read',
  'user:write',
  'device:read',
  'device:manage',
  'tenant:manage',
  'audit:read',
  'integration:manage',
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR_PERMISSIONS: Permission[] = [
  'call:read:own',
  'call:originate',
  'call:control',
  'recording:read:own',
  'contact:read:all',
  'contact:write',
  'deal:read:own',
  'deal:write',
  'task:read:own',
  'task:write',
  'sms:send',
  'sms:read:own',
  'qa:read:own',
  'qa:appeal',
  'analytics:read:own',
];

const SUPERVISOR_PERMISSIONS: Permission[] = [
  ...OPERATOR_PERMISSIONS,
  'call:read:all',
  'call:listen',
  'call:whisper',
  'call:barge',
  'recording:read:all',
  'deal:read:all',
  'task:read:all',
  'sms:read:all',
  'qa:evaluate',
  'qa:read:all',
  'analytics:read:all',
  'device:read',
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...SUPERVISOR_PERMISSIONS,
  'contact:delete',
  'contact:import',
  'sms:bulk',
  'queue:manage',
  'ivr:manage',
  'script:manage',
  'knowledge:manage',
  'shift:manage',
  'user:read',
];

const ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** AI-agent faqat belgilangan ssenariy doirasida ishlaydi. */
const AI_AGENT_PERMISSIONS: Permission[] = [
  'call:read:own',
  'call:originate',
  'call:control',
  'contact:read:all',
  'contact:write',
  'sms:send',
  'task:write',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OPERATOR: OPERATOR_PERMISSIONS,
  SUPERVISOR: SUPERVISOR_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  AI_AGENT: AI_AGENT_PERMISSIONS,
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  }
  return result;
}

export function hasPermission(roles: readonly Role[], required: Permission): boolean {
  return permissionsForRoles(roles).has(required);
}

/**
 * `:own` variantiga ega huquqlar uchun: foydalanuvchida `:all` bo'lsa - hammasi,
 * faqat `:own` bo'lsa - o'ziniki. Hech biri bo'lmasa - ruxsat yo'q.
 */
export type Scope = 'all' | 'own' | 'none';

export function resolveScope(roles: readonly Role[], resource: string, action: string): Scope {
  const granted = permissionsForRoles(roles);
  if (granted.has(`${resource}:${action}:all` as Permission)) return 'all';
  if (granted.has(`${resource}:${action}:own` as Permission)) return 'own';
  return 'none';
}
