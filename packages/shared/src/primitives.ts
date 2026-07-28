import { z } from 'zod';

/** O'zbekiston va xalqaro raqamlar uchun E.164 formati: +998901234567 */
export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Raqam E.164 formatida bo'lishi kerak, masalan +998901234567");

export type E164 = z.infer<typeof e164Schema>;

export const uuidSchema = z.string().uuid();

export type TenantId = string;
export type UserId = string;
export type OperatorId = string;
export type CallId = string;
export type ContactId = string;
export type DeviceId = string;
export type SmsId = string;

/**
 * Turli formatdagi kiritishni E.164 ga keltiradi.
 * O'zbekiston uchun standart: 9 xonali raqam yoki 998 bilan boshlanuvchi 12 xonali.
 */
export function normalizePhone(raw: string, defaultCountryCode = '998'): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let value = digits.startsWith('+') ? digits.slice(1) : digits;
  value = value.replace(/\D/g, '');

  // 00-prefiksli xalqaro format
  if (value.startsWith('00')) value = value.slice(2);
  // Mahalliy 8-prefiks
  else if (value.length === 10 && value.startsWith('8'))
    value = defaultCountryCode + value.slice(1);
  // Operator kodisiz 9 xonali mahalliy raqam
  else if (value.length === 9) value = defaultCountryCode + value;

  if (value.length < 8 || value.length > 15) return null;
  return `+${value}`;
}

/** Ro'yxatga olishda va CDR taqqoslashda ishlatiladigan kalit (faqat raqamlar). */
export function phoneSearchKey(raw: string): string {
  return raw.replace(/\D/g, '');
}
