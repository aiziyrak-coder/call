import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // 2FA yoqilgan bo'lsa, kod tasdiqlanmaguncha token to'liq huquq bermaydi.
    if (!payload.mfa) {
      throw new UnauthorizedException('Ikki bosqichli tasdiqlash yakunlanmagan');
    }

    // Rol yoki faollik o'zgargan bo'lsa, eski token darhol kuchini yo'qotadi.
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true },
      select: { id: true, tenantId: true, email: true, fullName: true, roles: true },
    });
    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi yoki faol emas');

    return { ...user, roles: user.roles as Role[] };
  }
}
