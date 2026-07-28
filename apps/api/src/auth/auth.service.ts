import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import type { Role } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload, RefreshPayload, TokenPair } from './auth.types';

/** Argon2id — OWASP tavsiya etgan parametrlar. */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  status: 'authenticated' | 'mfa_required';
  tokens?: TokenPair;
  /** 2FA talab qilinganda ikkinchi bosqichda ishlatiladigan qisqa muddatli token. */
  mfaToken?: string;
  user?: { id: string; email: string; fullName: string; roles: Role[]; tenantId: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async login(email: string, password: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
      include: { tenant: { select: { isActive: true } } },
    });

    // Foydalanuvchi topilmasa ham parolni tekshirganday vaqt sarflaymiz,
    // shunda javob vaqti bo'yicha email mavjudligini aniqlab bo'lmaydi.
    if (!user || !user.tenant.isActive) {
      await hash('dummy-password-for-timing', ARGON2_OPTIONS);
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }

    const valid = await verify(user.passwordHash, password).catch(() => false);
    if (!valid) throw new UnauthorizedException("Email yoki parol noto'g'ri");

    if (user.twoFactorEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, tid: user.tenantId, email: user.email, roles: user.roles, mfa: false },
        { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: '5m' },
      );
      return { status: 'mfa_required', mfaToken };
    }

    const tokens = await this.issueTokens(
      user.id,
      user.tenantId,
      user.email,
      user.roles as Role[],
      ctx,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      status: 'authenticated',
      tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles as Role[],
        tenantId: user.tenantId,
      },
    };
  }

  async verifyMfa(mfaToken: string, code: string, ctx: LoginContext = {}): Promise<LoginResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(mfaToken, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException("MFA tokeni yaroqsiz yoki muddati o'tgan");
    }
    if (payload.mfa) throw new BadRequestException('Bu token allaqachon tasdiqlangan');

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true },
    });
    if (!user?.twoFactorSecret) throw new UnauthorizedException('2FA sozlanmagan');

    if (!authenticator.verify({ token: code, secret: user.twoFactorSecret })) {
      throw new UnauthorizedException("Tasdiqlash kodi noto'g'ri");
    }

    const tokens = await this.issueTokens(
      user.id,
      user.tenantId,
      user.email,
      user.roles as Role[],
      ctx,
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      status: 'authenticated',
      tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles as Role[],
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Refresh token rotatsiyasi: har safar yangi token beriladi, eskisi bekor qilinadi.
   * Bekor qilingan token qayta ishlatilsa — o'g'irlangan deb hisoblanib,
   * butun token oilasi (family) o'chiriladi.
   */
  async refresh(refreshToken: string, ctx: LoginContext = {}): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }

    const tokenHash = AuthService.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) throw new UnauthorizedException('Refresh token topilmadi');

    if (stored.revokedAt) {
      this.logger.warn(
        `Bekor qilingan refresh token qayta ishlatildi (user=${payload.sub}). Oila bekor qilinmoqda.`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token bekor qilingan');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token muddati o'tgan");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Foydalanuvchi faol emas');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      user.id,
      user.tenantId,
      user.email,
      user.roles as Role[],
      ctx,
      stored.familyId,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = AuthService.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async setupTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    // Kod tasdiqlanmaguncha 2FA yoqilmaydi — foydalanuvchi o'zini bloklab qo'ymasligi uchun.
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, 'AiCC', secret) };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) throw new BadRequestException('Avval 2FA sozlanishi kerak');
    if (!authenticator.verify({ token: code, secret: user.twoFactorSecret })) {
      throw new BadRequestException("Tasdiqlash kodi noto'g'ri");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await verify(user.passwordHash, current).catch(() => false);
    if (!valid) throw new BadRequestException("Joriy parol noto'g'ri");

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.hashPassword(next) },
      }),
      // Parol o'zgarganda barcha sessiyalar tugatiladi.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    roles: Role[],
    ctx: LoginContext,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    // @nestjs/jwt `expiresIn` uchun `ms` kutubxonasining literal turini talab qiladi,
    // ammo qiymat konfiguratsiyadan keladi — shuning uchun aniq cast qilinadi.
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m') as `${number}m`;
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '7d') as `${number}d`;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, email, roles, mfa: true } satisfies JwtPayload,
      { secret: this.config.getOrThrow('JWT_SECRET'), expiresIn: accessTtl },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, fid: familyId, jti: randomUUID() } satisfies RefreshPayload,
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: AuthService.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { accessToken, refreshToken, expiresIn: parseTtlSeconds(accessTtl) };
  }
}

function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[match[2]!] ?? 60);
}
