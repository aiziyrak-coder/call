import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { countSmsSegments, SendSmsRequest, SmsProvider, SmsSendResult } from '@aicc/shared';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * GSM-shlyuz (Yeastar TG / Dinstar UC2000) ning HTTP API si orqali SMS.
 * Shlyuz allaqachon qo'ng'iroqlar uchun ishlatilgani sababli qo'shimcha
 * apparat kerak emas — SIM kartalar markazlashgan holda boshqariladi.
 */
@Injectable()
export class GatewayHttpSmsProvider implements SmsProvider {
  readonly name = 'gateway';
  readonly supportsDeliveryReports = true;

  private readonly logger = new Logger(GatewayHttpSmsProvider.name);
  private readonly baseUrl: string;
  private readonly auth: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('GSM_GATEWAY_BASE_URL', '').replace(/\/$/, '');
    const user = config.get<string>('GSM_GATEWAY_USER', '');
    const password = config.get<string>('GSM_GATEWAY_PASSWORD', '');
    this.auth = Buffer.from(`${user}:${password}`).toString('base64');
  }

  async send(request: SendSmsRequest): Promise<SmsSendResult> {
    const { segments } = countSmsSegments(request.text);
    const response = await this.request('/api/sms/send', {
      port: request.simSlot ?? 0,
      destination: request.to,
      text: request.text,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      message_id?: string;
      status?: string;
    };

    if (!response.ok) {
      throw new Error(`Shlyuz xatosi (${response.status}): ${payload.status ?? "noma'lum"}`);
    }

    return {
      providerMessageId: payload.message_id ?? '',
      status: 'SENT',
      segments,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    if (!this.baseUrl) return { healthy: false, detail: 'GSM_GATEWAY_BASE_URL sozlanmagan' };

    try {
      const response = await this.request('/api/status', undefined, 'GET');
      return response.ok
        ? { healthy: true }
        : { healthy: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async request(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<Response> {
    if (!this.baseUrl) throw new Error('GSM_GATEWAY_BASE_URL sozlanmagan');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${this.auth}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
