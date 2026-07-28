import { Controller, Get } from '@nestjs/common';
import { AudioSocketServer } from './audiosocket/audiosocket.server';
import { SttRegistry } from './stt/stt.registry';

@Controller('health')
export class HealthController {
  constructor(
    private readonly audio: AudioSocketServer,
    private readonly stt: SttRegistry,
  ) {}

  @Get()
  check() {
    return { status: 'ok', activeForks: this.audio.activeForks };
  }

  @Get('stt')
  async sttStatus() {
    return { providers: await this.stt.status() };
  }
}
