import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { AriClient } from './ari/ari.client';
import { EventPublisher } from './events/event-publisher.service';
import { PrismaModule } from './prisma/prisma.service';
import { AsteriskTelephonyProvider } from './telephony/asterisk.provider';
import { CallRegistry } from './telephony/call-session';
import { RoutingService } from './telephony/routing.service';
import { StasisService } from './telephony/stasis.service';
import {
  ServiceTokenGuard,
  TelephonyController,
  TelephonyHealthController,
} from './telephony/telephony.controller';

const envSchema = z.object({
  TELEPHONY_PORT: z.coerce.number().int().default(4100),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ARI_URL: z.string().url(),
  ARI_USER: z.string(),
  ARI_PASSWORD: z.string(),
  ARI_APP: z.string().default('aicc'),
  SERVICE_TOKEN: z.string().min(16),
  OUTBOUND_ENDPOINT_TEMPLATE: z.string().default('PJSIP/{number}@gsm-gateway'),
  ORIGINATE_TIMEOUT_SEC: z.coerce.number().int().default(45),
  AUDIOSOCKET_PORT: z.coerce.number().int().default(8090),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: (raw) => {
        const parsed = envSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            `Telefoniya konfiguratsiyasi xato:\n${parsed.error.issues
              .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
              .join('\n')}`,
          );
        }
        return { ...raw, ...parsed.data };
      },
    }),
    PrismaModule,
  ],
  controllers: [TelephonyHealthController, TelephonyController],
  providers: [
    AriClient,
    CallRegistry,
    EventPublisher,
    RoutingService,
    StasisService,
    AsteriskTelephonyProvider,
    ServiceTokenGuard,
  ],
})
export class AppModule {}
