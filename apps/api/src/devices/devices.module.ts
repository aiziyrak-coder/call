import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceAuthGuard } from './device-auth.guard';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [JwtModule.register({}), SmsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceAuthGuard],
  exports: [DevicesService],
})
export class DevicesModule {}
