import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PREFIX = 'enc:v1:';

/**
 * Maydonlar uchun AES-256-GCM (TOTP sir, SIP parol).
 * Eski plaintext qiymatlar o'qilganda avtomatik qaytariladi (migratsiya).
 */
@Injectable()
export class FieldCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex =
      config.get<string>('FIELD_ENCRYPTION_KEY') ??
      config.getOrThrow<string>('RECORDING_ENCRYPTION_KEY');
    this.key = Buffer.from(hex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY / RECORDING_ENCRYPTION_KEY 32 bayt (64 hex) bo\'lishi kerak');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(PREFIX)) return value; // legacy plaintext

    const raw = value.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = raw.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Shifrlangan maydon buzilgan');

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** Timing-safe solishtirish (turli uzunlikdagi stringlar uchun ham). */
export function safeEqual(a: string | undefined | null, b: string): boolean {
  if (!a) return false;
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** Path traversal oldini olish — faqat fayl nomi. */
export function safeBasename(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!base || base === '.' || base === '..' || base.includes('\0')) {
    throw new Error('Noto\'g\'ri fayl nomi');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(base)) {
    throw new Error('Fayl nomida ruxsat etilmagan belgilar');
  }
  return base;
}
