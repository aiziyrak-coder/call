import { z } from 'zod';
import { e164Schema } from './primitives.js';

export const SMS_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export const smsDirectionSchema = z.enum(SMS_DIRECTIONS);
export type SmsDirection = z.infer<typeof smsDirectionSchema>;

export const SMS_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'RECEIVED',
] as const;
export const smsStatusSchema = z.enum(SMS_STATUSES);
export type SmsStatus = z.infer<typeof smsStatusSchema>;

export const sendSmsSchema = z.object({
  to: e164Schema,
  text: z.string().min(1).max(1600),
  contactId: z.string().uuid().optional(),
  /** Aniq qurilma talab qilinsa (masalan, ma'lum SIM raqamidan yuborish). */
  deviceId: z.string().uuid().optional(),
  simSlot: z.number().int().min(0).max(3).optional(),
  templateId: z.string().uuid().optional(),
});
export type SendSmsRequest = z.infer<typeof sendSmsSchema>;

export interface SmsSendResult {
  providerMessageId: string;
  status: SmsStatus;
  segments: number;
}

export interface InboundSms {
  from: string;
  to: string;
  text: string;
  receivedAt: string;
  deviceId?: string;
  simSlot?: number;
}

/**
 * SMS provayderi. Implementatsiyalar: Android Companion, GSM-shlyuz HTTP API,
 * Eskiz.uz agregatori. Tanlov `SMS_PROVIDER` va qurilma holatiga qarab qilinadi.
 */
export interface SmsProvider {
  readonly name: string;
  send(request: SendSmsRequest): Promise<SmsSendResult>;
  /** Provayder yetkazilish statusini so'rov orqali beradimi. */
  readonly supportsDeliveryReports: boolean;
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>;
}

/** SMS shablonidagi `{{ism}}` ko'rinishidagi o'zgaruvchilarni almashtiradi. */
export function renderSmsTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

/** GSM-7 va UCS-2 ni hisobga olgan holda segmentlar sonini hisoblaydi. */
export function countSmsSegments(text: string): { segments: number; encoding: 'GSM7' | 'UCS2' } {
  // Kirill harflari GSM-7 ga sig'maydi, shuning uchun rus tilidagi SMS UCS-2 bo'ladi.
  const gsm7 =
    /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\r\n\f^{}\\[~\]|€]*$/;
  const isGsm7 = gsm7.test(text);
  const single = isGsm7 ? 160 : 70;
  const multi = isGsm7 ? 153 : 67;
  const segments = text.length <= single ? 1 : Math.ceil(text.length / multi);
  return { segments: Math.max(1, segments), encoding: isGsm7 ? 'GSM7' : 'UCS2' };
}
