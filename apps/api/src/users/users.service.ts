import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OperatorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface SoftphoneCredentials {
  extension: string;
  password: string;
  wssUrl: string;
  domain: string;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Brauzerdagi softfon Asterisk ga shu ma'lumotlar bilan ro'yxatdan o'tadi.
   * SIP paroli faqat egasiga beriladi va hech qachon ro'yxatlarda ko'rsatilmaydi.
   */
  async softphoneCredentials(user: AuthUser): Promise<SoftphoneCredentials> {
    const record = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, isActive: true },
      select: { sipExtension: true, sipPassword: true, fullName: true },
    });

    if (!record?.sipExtension || !record.sipPassword) {
      throw new BadRequestException(
        'Sizga SIP raqami biriktirilmagan. Administratorga murojaat qiling.',
      );
    }

    return {
      extension: record.sipExtension,
      password: record.sipPassword,
      wssUrl: this.config.get<string>('ASTERISK_WSS_URL', 'wss://localhost:8089/ws'),
      domain: this.config.get<string>('ASTERISK_SIP_DOMAIN', 'aicc.local'),
      displayName: record.fullName,
    };
  }

  async me(user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        roles: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        sipExtension: true,
        twoFactorEnabled: true,
        avatarUrl: true,
        tenant: { select: { id: true, name: true, timezone: true, locale: true } },
      },
    });
    return record;
  }

  /**
   * Operator holatini o'zgartiradi va oldingi holat davomiyligini yozib qo'yadi —
   * bu tanaffus vaqti hisobotlari uchun asos bo'ladi.
   */
  async setStatus(user: AuthUser, status: OperatorStatus, reason?: string) {
    if (status === 'BREAK' && !reason) {
      throw new BadRequestException("Tanaffus sababini ko'rsating");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { status: true, statusChangedAt: true },
      });

      if (current.status === status) {
        return { status, statusReason: reason ?? null, statusChangedAt: current.statusChangedAt };
      }

      await tx.operatorStatusEvent.updateMany({
        where: { userId: user.id, endedAt: null },
        data: {
          endedAt: now,
          durationSec: Math.round((now.getTime() - current.statusChangedAt.getTime()) / 1000),
        },
      });

      await tx.operatorStatusEvent.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          status,
          reason: reason ?? null,
          startedAt: now,
        },
      });

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { status, statusReason: reason ?? null, statusChangedAt: now },
        select: { status: true, statusReason: true, statusChangedAt: true },
      });

      return updated;
    });
  }

  /** Transfer oynasi uchun: hozir bo'sh turgan hamkasblar ro'yxati. */
  async listColleagues(user: AuthUser) {
    return this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        id: { not: user.id },
        sipExtension: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        sipExtension: true,
        status: true,
        roles: true,
      },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    });
  }

  async getById(user: AuthUser, id: string) {
    const record = await this.prisma.user.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        roles: true,
        isActive: true,
        status: true,
        sipExtension: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!record) throw new NotFoundException('Foydalanuvchi topilmadi');
    return record;
  }
}
