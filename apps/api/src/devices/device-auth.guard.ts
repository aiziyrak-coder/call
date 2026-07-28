import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface DeviceContext {
  id: string;
  tenantId: string;
  operatorId: string | null;
  simSlots: number;
}

/** Companion ilova so'rovlariga qo'shiladigan qurilma konteksti. */
export interface DeviceRequest extends Request {
  device?: DeviceContext;
}

/**
 * Companion ilovasi JWT emas, ro'yxatdan o'tishda berilgan uzoq muddatli
 * token bilan ishlaydi: telefon fon rejimida ishlaydi va tokenni yangilash
 * uchun foydalanuvchi aralashuvi bo'lmaydi.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const header = request.headers['x-device-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new UnauthorizedException("Qurilma tokeni yo'q");

    const device = await this.prisma.device.findFirst({
      where: { authTokenHash: hashToken(token), isActive: true },
      select: { id: true, tenantId: true, operatorId: true, simSlots: true },
    });
    if (!device) throw new UnauthorizedException('Qurilma tokeni yaroqsiz');

    request.device = device;
    return true;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
