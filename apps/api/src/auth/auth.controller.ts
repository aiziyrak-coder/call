import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ConfirmMfaDto, LoginDto, RefreshDto, VerifyMfaDto } from './auth.dto';
import { Audit, CurrentUser, Public } from './decorators';
import type { AuthUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // Parol tanlashga qarshi: bir IP dan daqiqasiga 10 urinish.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('auth.login', 'auth')
  @ApiOperation({ summary: 'Email va parol bilan kirish' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, requestContext(req));
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('auth.mfa_verify', 'auth')
  @ApiOperation({ summary: 'Ikki bosqichli tasdiqlash kodini tekshirish' })
  verifyMfa(@Body() dto: VerifyMfaDto, @Req() req: Request) {
    return this.auth.verifyMfa(dto.mfaToken, dto.code, requestContext(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Access tokenni yangilash (rotatsiya bilan)' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, requestContext(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Audit('auth.logout', 'auth')
  @ApiOperation({ summary: 'Chiqish — token oilasini bekor qiladi' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: "Joriy foydalanuvchi ma'lumotlari" })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('mfa/setup')
  @Audit('auth.mfa_setup', 'auth')
  @ApiOperation({ summary: '2FA uchun sir yaratish (QR kod uchun otpauth URL)' })
  setupMfa(@CurrentUser('id') userId: string) {
    return this.auth.setupTwoFactor(userId);
  }

  @Post('mfa/confirm')
  @HttpCode(204)
  @Audit('auth.mfa_confirm', 'auth')
  @ApiOperation({ summary: '2FA ni yoqish — birinchi kodni tasdiqlash' })
  async confirmMfa(@CurrentUser('id') userId: string, @Body() dto: ConfirmMfaDto): Promise<void> {
    await this.auth.confirmTwoFactor(userId, dto.code);
  }

  @Post('password')
  @HttpCode(204)
  @Audit('auth.change_password', 'auth')
  @ApiOperation({ summary: "Parolni o'zgartirish — barcha sessiyalar tugatiladi" })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}

function requestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}
