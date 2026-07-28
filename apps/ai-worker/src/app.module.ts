import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioSocketServer } from './audiosocket/audiosocket.server';
import { CallEndedConsumer } from './events/call-ended.consumer';
import { HealthController } from './health.controller';
import { OpenAiLlmService } from './llm/openai-llm.service';
import { RedisService } from './redis/redis.service';
import { GigaAmSttProvider } from './stt/gigaam.provider';
import { OpenAiWhisperSttProvider } from './stt/openai-whisper.provider';
import { WhisperLiveSttProvider } from './stt/whisper-live.provider';
import { SttRegistry } from './stt/stt.registry';
import { TranscriptPublisher } from './transcripts/transcript-publisher.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] })],
  controllers: [HealthController],
  providers: [
    RedisService,
    OpenAiWhisperSttProvider,
    GigaAmSttProvider,
    WhisperLiveSttProvider,
    SttRegistry,
    OpenAiLlmService,
    TranscriptPublisher,
    CallEndedConsumer,
    AudioSocketServer,
  ],
})
export class AppModule {}
