import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProvider } from '@aicc/shared';
import { AndroidCompanionSmsProvider } from './android-companion.provider';
import { GatewayHttpSmsProvider } from './gateway-http.provider';
import { EskizUzSmsProvider } from './eskiz-uz.provider';

/**
 * Provayderlarni ustuvorlik bo'yicha tanlaydi. TZ 5.6: asosiy kanal — Android
 * qurilma (SIM balansi arzon), qurilma oflayn bo'lsa GSM-shlyuz, u ham
 * ishlamasa Eskiz.uz agregatori. Shu tariqa SMS uzluksiz yetkaziladi.
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly logger = new Logger(SmsProviderRegistry.name);
  private readonly order: SmsProvider[];

  constructor(
    config: ConfigService,
    android: AndroidCompanionSmsProvider,
    gateway: GatewayHttpSmsProvider,
    eskiz: EskizUzSmsProvider,
  ) {
    const byName: Record<string, SmsProvider> = {
      android,
      gateway,
      eskiz,
    };

    const preferred = config.get<string>('SMS_PROVIDER', 'android');
    const rest = Object.keys(byName).filter((name) => name !== preferred);
    this.order = [preferred, ...rest]
      .map((name) => byName[name])
      .filter((provider): provider is SmsProvider => Boolean(provider));
  }

  /** Sog'lom birinchi provayderni qaytaradi. */
  async pick(): Promise<SmsProvider> {
    for (const provider of this.order) {
      const health = await provider.healthCheck().catch((error: Error) => ({
        healthy: false,
        detail: error.message,
      }));
      if (health.healthy) return provider;
      this.logger.warn(`SMS provayderi tayyor emas (${provider.name}): ${health.detail ?? ''}`);
    }
    throw new ServiceUnavailableException('Hech bir SMS provayderi ishlamayapti');
  }

  byName(name: string): SmsProvider | undefined {
    return this.order.find((provider) => provider.name === name);
  }

  async status(): Promise<Array<{ name: string; healthy: boolean; detail?: string }>> {
    return Promise.all(
      this.order.map(async (provider) => ({
        name: provider.name,
        ...(await provider.healthCheck().catch((error: Error) => ({
          healthy: false,
          detail: error.message,
        }))),
      })),
    );
  }
}
