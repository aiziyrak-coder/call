import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from './common/zod';
import { validateEnv } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { RecordingsModule } from './recordings/recordings.module';
import { CrmModule } from './crm/crm.module';
import { SmsModule } from './sms/sms.module';
import { DevicesModule } from './devices/devices.module';
import { AdminModule } from './admin/admin.module';
import { TranscriptsModule } from './transcripts/transcripts.module';
import { RealtimeModule } from './realtime/realtime.module';
import { JwtAuthGuard, PermissionsGuard } from './auth/guards';
import { AuditInterceptor } from './common/audit.interceptor';
import { AllExceptionsFilter } from './common/exception.filter';
import { HealthModule } from './health/health.module';
import { CryptoModule } from './common/crypto.module';
import { CsrfOriginMiddleware } from './common/csrf-origin.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    CryptoModule,
    PrismaModule,
    RedisModule,
    RealtimeModule,
    AuthModule,
    CallsModule,
    RecordingsModule,
    CrmModule,
    SmsModule,
    DevicesModule,
    AdminModule,
    TranscriptsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfOriginMiddleware).forRoutes('*');
  }
}
