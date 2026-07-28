import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ConfirmMfaDto,
  DisableMfaDto,
  LoginDto,
  RefreshDto,
  VerifyMfaDto,
} from './auth.dto';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './auth-cookies';
import { Audit, CurrentUser, Public } from './decorators';
import type { AuthUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('auth.login', 'auth')
  @ApiOperation({ summary: 'Email va parol bilan kirish' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, requestContext(req));
    if (result.tokens) setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('auth.mfa_verify', 'auth')
  @ApiOperation({ summary: 'Ikki bosqichli tasdiqlash kodini tekshirish' })
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyMfa(dto.mfaToken, dto.code, requestContext(req));
    if (result.tokens) setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Access tokenni yangilash (rotatsiya bilan)' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      dto.refreshToken || (req.cookies?.[REFRESH_COOKIE] as string | undefined) || '';
    const tokens = await this.auth.refresh(refreshToken, requestContext(req));
    setAuthCookies(res, tokens);
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Audit('auth.logout', 'auth')
  @ApiOperation({ summary: 'Chiqish — token oilasini bekor qiladi' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken =
      dto.refreshToken || (req.cookies?.[REFRESH_COOKIE] as string | undefined) || '';
    if (refreshToken) await this.auth.logout(refreshToken);
    clearAuthCookies(res);
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

  @Post('mfa/disable')
  @HttpCode(204)
  @Audit('auth.mfa_disable', 'auth')
  @ApiOperation({ summary: "2FA ni o'chirish — parol + TOTP talab qilinadi" })
  async disableMfa(@CurrentUser('id') userId: string, @Body() dto: DisableMfaDto): Promise<void> {
    await this.auth.disableTwoFactor(userId, dto.password, dto.code);
  }

  @Post('password')
  @HttpCode(204)
  @Audit('auth.change_password', 'auth')
  @ApiOperation({ summary: "Parolni o'zgartirish — barcha sessiyalar tugatiladi" })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
    clearAuthCookies(res);
  }
}

function requestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export { ACCESS_COOKIE };
