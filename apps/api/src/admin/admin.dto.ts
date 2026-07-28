import { z } from 'zod';
import { createZodDto } from '../common/zod';
import { paginationSchema } from '../common/pagination';

const roleSchema = z.enum(['OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'AI_AGENT']);

export const userListSchema = paginationSchema.extend({
  search: z.string().max(120).optional(),
  role: roleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

const strongPassword = z
  .string()
  .min(10, "Parol kamida 10 belgidan iborat bo'lsin")
  .max(72)
  .regex(/[a-z]/, "Kichik harf bo'lishi kerak")
  .regex(/[A-Z]/, "Katta harf bo'lishi kerak")
  .regex(/\d/, "Raqam bo'lishi kerak");

export const userCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  password: strongPassword,
  phone: z.string().max(32).optional(),
  roles: z.array(roleSchema).min(1),
  sipExtension: z
    .string()
    .regex(/^\d{3,6}$/)
    .optional(),
});

export const userUpdateSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().max(32).nullish(),
  roles: z.array(roleSchema).min(1).optional(),
  isActive: z.boolean().optional(),
  /** Bo'sh string SIP hisobini o'chiradi. */
  sipExtension: z
    .string()
    .regex(/^\d{3,6}$/)
    .or(z.literal(''))
    .optional(),
  password: strongPassword.optional(),
});

export const queueWriteSchema = z.object({
  name: z.string().min(1).max(120),
  extension: z.string().regex(/^\d{3,6}$/),
  strategy: z.enum(['round_robin', 'least_recent', 'fewest_calls', 'skill_based']),
  slaSeconds: z.coerce.number().int().min(5).max(600).default(20),
  maxWaitSeconds: z.coerce.number().int().min(10).max(3600).default(300),
  announcePosition: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const auditListSchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  action: z.string().max(60).optional(),
  resource: z.string().max(60).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const analyticsRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  queueId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
});

export const tenantSettingsSchema = z.object({
  businessProfile: z.string().max(20_000).optional(),
  priceList: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        price: z.string().min(1).max(80),
        unit: z.string().max(40).optional(),
        note: z.string().max(400).optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  phones: z.array(z.string().min(5).max(32)).min(1).max(500),
  goal: z.string().max(2000).optional(),
});

export class UserCreateDto extends createZodDto(userCreateSchema) {}
export class UserUpdateDto extends createZodDto(userUpdateSchema) {}
export class QueueWriteDto extends createZodDto(queueWriteSchema) {}
export class TenantSettingsDto extends createZodDto(tenantSettingsSchema) {}
export class CampaignCreateDto extends createZodDto(campaignCreateSchema) {}
