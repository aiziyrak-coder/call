import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsProviderRegistry } from './providers/sms-provider.registry';
import { AndroidCompanionSmsProvider } from './providers/android-companion.provider';
import { GatewayHttpSmsProvider } from './providers/gateway-http.provider';
import { EskizUzSmsProvider } from './providers/eskiz-uz.provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SmsController],
  providers: [
    SmsService,
    SmsProviderRegistry,
    AndroidCompanionSmsProvider,
    GatewayHttpSmsProvider,
    EskizUzSmsProvider,
  ],
  exports: [SmsService],
})
export class SmsModule {}
