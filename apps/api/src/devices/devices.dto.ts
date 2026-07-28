import { z } from 'zod';
import { createZodDto } from '../common/zod';

export const enrollSchema = z.object({
  /** `DEVICE_ENROLLMENT_SECRET` — admin panelidan olinadi. */
  enrollmentSecret: z.string().min(8),
  tenantSlug: z.string().min(1).optional(),
  hardwareId: z.string().min(4).max(128),
  name: z.string().min(1).max(120),
  phoneNumbers: z.array(z.string().min(3)).max(4).default([]),
  simSlots: z.coerce.number().int().min(1).max(4).default(1),
  appVersion: z.string().max(32).optional(),
  operatorEmail: z.string().email().optional(),
});

export const heartbeatSchema = z.object({
  batteryLevel: z.coerce.number().int().min(0).max(100).optional(),
  signalStrength: z.coerce.number().int().min(-140).max(0).optional(),
  networkType: z.string().max(32).optional(),
  appVersion: z.string().max(32).optional(),
  phoneNumbers: z.array(z.string().min(3)).max(4).optional(),
});

export const smsStatusReportSchema = z.object({
  smsId: z.string().uuid(),
  status: z.enum(['SENDING', 'SENT', 'DELIVERED', 'FAILED']),
  providerMessageId: z.string().max(120).optional(),
  error: z.string().max(500).optional(),
});

export const inboundSmsSchema = z.object({
  from: z.string().min(3),
  to: z.string().min(3),
  text: z.string().min(1).max(4000),
  receivedAt: z.string().datetime().optional(),
  simSlot: z.coerce.number().int().min(0).max(3).optional(),
});

export const deviceCallReportSchema = z.object({
  state: z.enum(['RINGING', 'OFFHOOK', 'IDLE']),
  number: z.string().min(3).optional(),
  simSlot: z.coerce.number().int().min(0).max(3).optional(),
});

export const deviceWriteSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  operatorId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
});

export class EnrollDeviceDto extends createZodDto(enrollSchema) {}
export class HeartbeatDto extends createZodDto(heartbeatSchema) {}
export class SmsStatusReportDto extends createZodDto(smsStatusReportSchema) {}
export class InboundSmsDto extends createZodDto(inboundSmsSchema) {}
export class DeviceCallReportDto extends createZodDto(deviceCallReportSchema) {}
export class DeviceWriteDto extends createZodDto(deviceWriteSchema) {}
