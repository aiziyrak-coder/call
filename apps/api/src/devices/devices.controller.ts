import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { SmsService } from '../sms/sms.service';
import { DeviceAuthGuard, DeviceRequest } from './device-auth.guard';
import {
  DeviceCallReportDto,
  DeviceCallDto,
  DeviceWriteDto,
  EnrollDeviceDto,
  HeartbeatDto,
  InboundSmsDto,
  SmsStatusReportDto,
} from './devices.dto';
import { Audit, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { Throttle } from '@nestjs/throttler';

/** Companion ilovasi uchun endpointlar — JWT emas, qurilma tokeni bilan. */
@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly sms: SmsService,
  ) {}

  @Public()
  @Post('enroll')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Companion ilovasini ro'yxatdan o'tkazish" })
  enroll(@Body() body: EnrollDeviceDto) {
    return this.devices.enroll(body);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('heartbeat')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Qurilma holati va kutilayotgan buyruqlar' })
  heartbeat(@Req() request: DeviceRequest, @Body() body: HeartbeatDto) {
    return this.devices.heartbeat(requireDevice(request), body);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('outbox')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Jo'natilishi kerak bo'lgan SMS lar" })
  outbox(@Req() request: DeviceRequest) {
    return this.devices.outbox(requireDevice(request));
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('sms/status')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'SMS yuborilish natijasi' })
  smsStatus(@Req() request: DeviceRequest, @Body() body: SmsStatusReportDto) {
    const device = requireDevice(request);
    return this.sms.updateStatus({
      tenantId: device.tenantId,
      smsId: body.smsId,
      status: body.status,
      providerMessageId: body.providerMessageId,
      error: body.error,
    });
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('sms/inbound')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Qabul qilingan SMS ni CRM ga yozish' })
  inbound(@Req() request: DeviceRequest, @Body() body: InboundSmsDto) {
    const device = requireDevice(request);
    return this.sms.ingestInbound({
      tenantId: device.tenantId,
      from: body.from,
      to: body.to,
      text: body.text,
      receivedAt: body.receivedAt,
      deviceId: device.id,
      simSlot: body.simSlot,
    });
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('calls/report')
  @HttpCode(204)
  @ApiOperation({ summary: "Qurilmadagi qo'ng'iroq holati (zaxira kanal telemetriyasi)" })
  report(@Req() request: DeviceRequest, @Body() body: DeviceCallReportDto): void {
    const device = requireDevice(request);
    // MVP da bu ma'lumot faqat monitoring uchun; qo'ng'iroq oqimi Asterisk orqali boradi.
    void device;
    void body;
  }

  // ------------------------------------------------------------------ admin

  @Get('setup-guide')
  @ApiOperation({ summary: "Companion o'rnatish yo'riqnomasi (server, sir, slug)" })
  setupGuide(@CurrentUser() user: AuthUser) {
    return this.devices.setupGuide(user);
  }

  @Get()
  @RequirePermissions('device:read')
  @ApiOperation({ summary: "Qurilmalar ro'yxati va holati" })
  list(@CurrentUser() user: AuthUser) {
    return this.devices.list(user);
  }

  @Post('call')
  @RequirePermissions('call:originate')
  @Audit('device.call', 'device')
  @ApiOperation({ summary: "Click-to-call: qurilmaga terish buyrug'i" })
  call(@CurrentUser() user: AuthUser, @Body() body: DeviceCallDto) {
    return this.devices.requestCall(user, body.number, body.simSlot);
  }

  @Patch(':id')
  @RequirePermissions('device:manage')
  @Audit('device.update', 'device')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: DeviceWriteDto) {
    return this.devices.update(user, id, body);
  }

  @Post(':id/restart')
  @RequirePermissions('device:manage')
  @Audit('device.restart', 'device')
  restart(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.devices.restart(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('device:manage')
  @Audit('device.delete', 'device')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.devices.remove(user, id);
  }
}

function requireDevice(request: DeviceRequest) {
  if (!request.device) throw new UnauthorizedException('Qurilma aniqlanmadi');
  return request.device;
}
