import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SttProvider } from '@aicc/shared';
import { OpenAiWhisperSttProvider } from './openai-whisper.provider';
import { GigaAmSttProvider } from './gigaam.provider';
import { WhisperLiveSttProvider } from './whisper-live.provider';

/**
 * STT tanlash: asosiy — OpenAI Whisper; zaxira — GigaAM / WhisperLive.
 */
@Injectable()
export class SttRegistry {
  private readonly logger = new Logger(SttRegistry.name);
  private readonly preferred: string;

  constructor(
    private readonly openai: OpenAiWhisperSttProvider,
    private readonly gigaam: GigaAmSttProvider,
    private readonly whisper: WhisperLiveSttProvider,
    config: ConfigService,
  ) {
    this.preferred = config.get<string>('STT_PROVIDER', 'openai');
  }

  get(language: string): SttProvider {
    if (this.preferred === 'openai') return this.openai;
    if (this.preferred === 'whisper-live') return this.whisper;
    if (this.preferred === 'gigaam') {
      if (!this.gigaam.supportedLanguages.includes(language as never)) {
        this.logger.log(`"${language}" GigaAM da yo'q — OpenAI ishlatiladi`);
        return this.openai;
      }
      return this.gigaam;
    }
    return this.openai;
  }

  async status() {
    const [openai, gigaam, whisper] = await Promise.all([
      this.openai.healthCheck(),
      this.gigaam.healthCheck(),
      this.whisper.healthCheck(),
    ]);
    return [
      { name: this.openai.name, ...openai },
      { name: this.gigaam.name, ...gigaam },
      { name: this.whisper.name, ...whisper },
    ];
  }
}
