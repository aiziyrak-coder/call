import { z } from 'zod';
import { createZodDto } from '../common/zod';
import { paginationSchema } from '../common/pagination';

const phoneInput = z.object({
  phone: z.string().min(3),
  label: z.string().max(32).optional(),
  isPrimary: z.boolean().optional(),
});

export const contactWriteSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional(),
  company: z.string().max(160).optional(),
  email: z.string().email().optional(),
  address: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  source: z.string().max(60).optional(),
  ownerId: z.string().uuid().nullish(),
  phones: z.array(phoneInput).max(10).optional(),
});

export const contactListSchema = paginationSchema.extend({
  search: z.string().max(120).optional(),
  tag: z.string().max(40).optional(),
  ownerId: z.string().uuid().optional(),
  // Birlashtirilgan (duplikat) kartochkalar odatda ro'yxatda ko'rinmaydi.
  includeMerged: z.coerce.boolean().default(false),
});

export const mergeContactsSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

export const dealWriteSchema = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().uuid().nullish(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  ownerId: z.string().uuid().nullish(),
  amount: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  lostReason: z.string().max(400).nullish(),
});

export const dealMoveSchema = z.object({
  stageId: z.string().uuid(),
  // Ustun ichidagi yangi o'rni (0 dan boshlanadi).
  position: z.coerce.number().int().min(0),
  /** LOST bosqichiga o'tkazganda sabab (ixtiyoriy, lekin UI so'raydi). */
  lostReason: z.string().max(400).optional(),
});

export const taskWriteSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dueAt: z.coerce.date().nullish(),
  assigneeId: z.string().uuid().nullish(),
  contactId: z.string().uuid().nullish(),
  dealId: z.string().uuid().nullish(),
});

export const taskListSchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  assigneeId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  dueBefore: z.coerce.date().optional(),
});

export const timelineSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.date().optional(),
});

export const lookupSchema = z.object({
  phone: z.string().min(3),
});

export const importSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
  // Mavjud raqamga duch kelganda: yangisini yaratmaslik yoki maydonlarni to'ldirish.
  onDuplicate: z.enum(['skip', 'update']).default('skip'),
});

export class ContactWriteDto extends createZodDto(contactWriteSchema) {}
export class MergeContactsDto extends createZodDto(mergeContactsSchema) {}
export class DealWriteDto extends createZodDto(dealWriteSchema) {}
export class DealMoveDto extends createZodDto(dealMoveSchema) {}
export class TaskWriteDto extends createZodDto(taskWriteSchema) {}
export class ImportContactsDto extends createZodDto(importSchema) {}
