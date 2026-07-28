import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsersService } from './users.service';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import { createZodDto } from '../common/zod';
import type { AuthUser } from '../auth/auth.types';

const setStatusSchema = z.object({
  status: z.enum(['OFFLINE', 'AVAILABLE', 'ON_CALL', 'AFTER_CALL_WORK', 'BREAK']),
  reason: z.string().max(120).optional(),
});
class SetStatusDto extends createZodDto(setStatusSchema) {}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi profili va holati' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user);
  }

  @Get('me/softphone')
  @ApiOperation({ summary: "Brauzer softfoni uchun SIP hisob ma'lumotlari" })
  softphone(@CurrentUser() user: AuthUser) {
    return this.users.softphoneCredentials(user);
  }

  @Post('me/status')
  @Audit('user.set_status', 'user')
  @ApiOperation({ summary: "Operator holatini o'zgartirish (tanaffus va h.k.)" })
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: SetStatusDto) {
    return this.users.setStatus(user, dto.status, dto.reason);
  }

  @Get('colleagues')
  @ApiOperation({ summary: "Transfer uchun hamkasblar ro'yxati" })
  colleagues(@CurrentUser() user: AuthUser) {
    return this.users.listColleagues(user);
  }

  @Get(':id')
  @RequirePermissions('user:read')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.getById(user, id);
  }
}
