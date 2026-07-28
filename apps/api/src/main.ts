import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const isProd = config.get('NODE_ENV') === 'production';

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  // Nginx / proxy orqasida Secure cookie va real IP uchun.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false, // API JSON — CSP brauzer uchun nginx/Next da
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const origins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.includes('*')) {
    throw new Error('CORS_ORIGINS="*" credentials bilan xavfsiz emas');
  }

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AiCC Core API')
      .setDescription('AI Call Center — asosiy API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`AiCC API tayyor: http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
