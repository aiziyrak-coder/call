import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { countSmsSegments, SendSmsRequest, SmsProvider, SmsSendResult } from '@aicc/shared';

const REQUEST_TIMEOUT_MS = 15_000;
// Eskiz tokeni 30 kun amal qiladi; ehtiyot uchun erta yangilaymiz.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000;

interface EskizToken {
  value: string;
  expiresAt: number;
}

/**
 * Eskiz.uz agregatori — Android qurilma va shlyuz ishlamay qolganda zaxira kanal.
 * Narxi qimmatroq, lekin yetkazilish kafolati yuqori (TZ 5.6).
 */
@Injectable()
export class EskizUzSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  readonly supportsDeliveryReports = true;

  private readonly logger = new Logger(EskizUzSmsProvider.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly from: string;
  private token: EskizToken | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('ESKIZ_BASE_URL', 'https://notify.eskiz.uz/api')
      .replace(/\/$/, '');
    this.email = config.get<string>('ESKIZ_EMAIL', '');
    this.password = config.get<string>('ESKIZ_PASSWORD', '');
    this.from = config.get<string>('ESKIZ_FROM', '4546');
  }

  async send(request: SendSmsRequest): Promise<SmsSendResult> {
    const { segments } = countSmsSegments(request.text);
    const token = await this.authenticate();

    const form = new URLSearchParams({
      // Eskiz raqamni `+` siz, faqat raqamlarda kutadi.
      mobile_phone: request.to.replace(/\D/g, ''),
      message: request.text,
      from: this.from,
    });

    const response = await this.fetchWithTimeout(`${this.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string | number;
      status?: string;
      message?: string;
    };

    if (!response.ok) {
      // 401 — token eskirgan bo'lishi mumkin, keyingi urinishda qayta olamiz.
      if (response.status === 401) this.token = null;
      throw new Error(`Eskiz xatosi (${response.status}): ${payload.message ?? "noma'lum"}`);
    }

    return {
      providerMessageId: String(payload.id ?? ''),
      status: 'SENT',
      segments,
    };
  }

  /** Eskiz `message/:id/status` orqali yetkazilishni tekshiradi. */
  async fetchStatus(providerMessageId: string): Promise<string | null> {
    try {
      const token = await this.authenticate();
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/message/sms/status_by_id/${providerMessageId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as { status?: string };
      return payload.status ?? null;
    } catch (error) {
      this.logger.warn(`Statusni olib bo'lmadi: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    if (!this.email || !this.password) {
      return { healthy: false, detail: 'ESKIZ_EMAIL/ESKIZ_PASSWORD sozlanmagan' };
    }
    try {
      await this.authenticate();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (!this.email || !this.password) throw new Error("Eskiz hisob ma'lumotlari yo'q");

    const form = new URLSearchParams({ email: this.email, password: this.password });
    const response = await this.fetchWithTimeout(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    if (!response.ok)
      throw new Error(`Eskiz autentifikatsiyasi muvaffaqiyatsiz (${response.status})`);

    const payload = (await response.json()) as { data?: { token?: string } };
    const value = payload.data?.token;
    if (!value) throw new Error('Eskiz tokeni qaytmadi');

    this.token = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
    return value;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
