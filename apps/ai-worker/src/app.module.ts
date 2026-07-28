import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioSocketServer } from './audiosocket/audiosocket.server';
import { HealthController } from './health.controller';
import { RedisService } from './redis/redis.service';
import { GigaAmSttProvider } from './stt/gigaam.provider';
import { WhisperLiveSttProvider } from './stt/whisper-live.provider';
import { SttRegistry } from './stt/stt.registry';
import { TranscriptPublisher } from './transcripts/transcript-publisher.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] })],
  controllers: [HealthController],
  providers: [
    RedisService,
    GigaAmSttProvider,
    WhisperLiveSttProvider,
    SttRegistry,
    TranscriptPublisher,
    AudioSocketServer,
  ],
})
export class AppModule {}
