import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { Role } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';
import { ACCESS_COOKIE } from './auth-cookies';

function accessFromRequest(req: Request): string | null {
  const header = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (header) return header;
  const cookie = req.cookies?.[ACCESS_COOKIE];
  return typeof cookie === 'string' && cookie.length > 0 ? cookie : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: accessFromRequest,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.mfa) {
      throw new UnauthorizedException('Ikki bosqichli tasdiqlash yakunlanmagan');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true },
      select: { id: true, tenantId: true, email: true, fullName: true, roles: true },
    });
    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi yoki faol emas');

    return { ...user, roles: user.roles as Role[] };
  }
}
