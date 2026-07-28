import { z } from 'zod';
import { createZodDto } from '../common/zod';
import { paginationSchema } from '../common/pagination';

const roleSchema = z.enum(['OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'AI_AGENT']);

export const userListSchema = paginationSchema.extend({
  search: z.string().max(120).optional(),
  role: roleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const userCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(72),
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
  password: z.string().min(8).max(72).optional(),
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

export class UserCreateDto extends createZodDto(userCreateSchema) {}
export class UserUpdateDto extends createZodDto(userUpdateSchema) {}
export class QueueWriteDto extends createZodDto(queueWriteSchema) {}
