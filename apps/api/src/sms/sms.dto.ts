import { z } from 'zod';
import { createZodDto } from '../common/zod';
import { paginationSchema } from '../common/pagination';

export const sendSmsSchema = z.object({
  // Raqam serverda E.164 ga keltiriladi, shuning uchun erkin format qabul qilinadi.
  to: z.string().min(3),
  text: z.string().min(1).max(1600),
  contactId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  simSlot: z.coerce.number().int().min(0).max(3).optional(),
  templateId: z.string().uuid().optional(),
  /** Shablondagi `{{ism}}` kabi o'zgaruvchilar. */
  variables: z.record(z.string()).optional(),
});

export const bulkSmsSchema = z.object({
  text: z.string().min(1).max(1600).optional(),
  templateId: z.string().uuid().optional(),
  /** Aniq kontaktlar ro'yxati yoki teg bo'yicha segment. */
  contactIds: z.array(z.string().uuid()).max(5000).optional(),
  tag: z.string().max(40).optional(),
  variables: z.record(z.string()).optional(),
});

export const smsListSchema = paginationSchema.extend({
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED']).optional(),
  contactId: z.string().uuid().optional(),
  search: z.string().max(120).optional(),
});

export const templateWriteSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(1600),
});

export class SendSmsDto extends createZodDto(sendSmsSchema) {}
export class BulkSmsDto extends createZodDto(bulkSmsSchema) {}
export class TemplateWriteDto extends createZodDto(templateWriteSchema) {}
