import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'enc:v1:';

/** Telephony provision skripti uchun — API FieldCryptoService bilan mos. */
export function decryptField(value: string | null | undefined, keyHex: string): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const key = Buffer.from(keyHex, 'hex');
  const raw = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = raw.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Shifrlangan maydon buzilgan');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptField(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function safeEqual(a: string | undefined | null, b: string): boolean {
  if (!a) return false;
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
