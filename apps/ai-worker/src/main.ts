import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('internal');
  app.enableShutdownHooks();

  const port = config.get<number>('AI_WORKER_PORT', 4200);
  // Faqat lokal tarmoq: HTTP interfeys diagnostika uchun.
  await app.listen(port, '0.0.0.0');
  Logger.log(`AiCC AI Worker tayyor: http://localhost:${port}/internal`, 'Bootstrap');
}

void bootstrap();
