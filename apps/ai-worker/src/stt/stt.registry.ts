import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SttProvider } from '@aicc/shared';
import { GigaAmSttProvider } from './gigaam.provider';
import { WhisperLiveSttProvider } from './whisper-live.provider';

/**
 * STT provayderi konfiguratsiya bilan tanlanadi: rus tili uchun GigaAM,
 * boshqa tillar yoki GigaAM ishlamayotganda WhisperLive.
 */
@Injectable()
export class SttRegistry {
  private readonly logger = new Logger(SttRegistry.name);
  private readonly preferred: string;

  constructor(
    private readonly gigaam: GigaAmSttProvider,
    private readonly whisper: WhisperLiveSttProvider,
    config: ConfigService,
  ) {
    this.preferred = config.get<string>('STT_PROVIDER', 'gigaam');
  }

  get(language: string): SttProvider {
    if (this.preferred === 'whisper-live') return this.whisper;
    if (!this.gigaam.supportedLanguages.includes(language as never)) {
      this.logger.log(`"${language}" tili GigaAM da yo'q — WhisperLive ishlatiladi`);
      return this.whisper;
    }
    return this.gigaam;
  }

  async status() {
    const [gigaam, whisper] = await Promise.all([
      this.gigaam.healthCheck(),
      this.whisper.healthCheck(),
    ]);
    return [
      { name: this.gigaam.name, ...gigaam },
      { name: this.whisper.name, ...whisper },
    ];
  }
}
