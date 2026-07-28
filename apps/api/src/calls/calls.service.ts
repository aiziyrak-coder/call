import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { hasPermission, normalizePhone, resolveScope, Role } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TelephonyClient } from '../telephony/telephony-client.service';
import { skipTake, toPage, Page, Pagination } from '../common/pagination';
import type { AuthUser } from '../auth/auth.types';

export interface CallFilters extends Pagination {
  direction?: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  disposition?: string;
  operatorId?: string;
  contactId?: string;
  queueId?: string;
  search?: string;
  from?: string;
  to?: string;
}

const CALL_LIST_SELECT = {
  id: true,
  direction: true,
  state: true,
  disposition: true,
  fromNumber: true,
  toNumber: true,
  startedAt: true,
  answeredAt: true,
  endedAt: true,
  durationSec: true,
  talkTimeSec: true,
  waitTimeSec: true,
  notes: true,
  operator: { select: { id: true, fullName: true } },
  contact: { select: { id: true, firstName: true, lastName: true, company: true } },
  queue: { select: { id: true, name: true } },
  recording: { select: { id: true, durationSec: true, format: true } },
} satisfies Prisma.CallSelect;

@Injectable()
export class CallsService {
  private readonly audioSocketHost: string;
  private readonly audioSocketPort: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telephony: TelephonyClient,
    config: ConfigService,
  ) {
    this.audioSocketHost = config.get<string>('AUDIOSOCKET_HOST', 'host.docker.internal');
    this.audioSocketPort = config.get<number>('AUDIOSOCKET_PORT', 8090);
  }

  async list(user: AuthUser, filters: CallFilters): Promise<Page<unknown>> {
    const scope = resolveScope(user.roles, 'call', 'read');
    if (scope === 'none') throw new ForbiddenException("Qo'ng'iroqlarni ko'rish huquqi yo'q");

    const where: Prisma.CallWhereInput = { tenantId: user.tenantId };
    if (scope === 'own') where.operatorId = user.id;
    else if (filters.operatorId) where.operatorId = filters.operatorId;

    if (filters.direction) where.direction = filters.direction;
    if (filters.disposition) {
      where.disposition = filters.disposition as Prisma.CallWhereInput['disposition'];
    }
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.queueId) where.queueId = filters.queueId;

    if (filters.from || filters.to) {
      where.startedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    if (filters.search) {
      const digits = filters.search.replace(/\D/g, '');
      where.OR = [
        { fromNumber: { contains: filters.search, mode: 'insensitive' } },
        { toNumber: { contains: filters.search, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ peerKey: { contains: digits } }] : []),
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({
        where,
        select: CALL_LIST_SELECT,
        orderBy: { startedAt: 'desc' },
        ...skipTake(filters),
      }),
      this.prisma.call.count({ where }),
    ]);

    return toPage(items, total, filters);
  }

  async getById(user: AuthUser, callId: string) {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, tenantId: user.tenantId },
      select: {
        ...CALL_LIST_SELECT,
        hangupCause: true,
        transcript: {
          select: {
            id: true,
            language: true,
            engine: true,
            summary: true,
            segments: {
              select: { speaker: true, text: true, startMs: true, endMs: true, confidence: true },
              orderBy: { startMs: 'asc' },
            },
          },
        },
      },
    });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi");

    const scope = resolveScope(user.roles, 'call', 'read');
    if (scope === 'own' && call.operator?.id !== user.id) {
      throw new ForbiddenException("Bu qo'ng'iroq sizga tegishli emas");
    }
    return call;
  }

  /** Jonli suhbatlar — telefoniya servisining xotirasidan olinadi. */
  async listActive(user: AuthUser) {
    const calls = await this.telephony.activeCalls();
    const scope = resolveScope(user.roles, 'call', 'read');
    return calls
      .filter((call) => call.tenantId === user.tenantId)
      .filter((call) => scope === 'all' || call.operatorId === user.id);
  }

  /** CRM dan "click-to-call": avval operator, keyin mijoz chaqiriladi. */
  async originate(user: AuthUser, to: string, contactId?: string, operatorId?: string) {
    if (!hasPermission(user.roles, 'call:originate')) {
      throw new ForbiddenException("Qo'ng'iroq qilish huquqi yo'q");
    }

    const normalized = normalizePhone(to);
    if (!normalized) throw new BadRequestException(`Raqam noto'g'ri: ${to}`);

    // Boshqa operator nomidan qo'ng'iroq qilish faqat menejerga ruxsat.
    const targetOperator = operatorId ?? user.id;
    if (targetOperator !== user.id && !hasPermission(user.roles, 'user:write')) {
      throw new ForbiddenException("Boshqa operator nomidan qo'ng'iroq qilib bo'lmaydi");
    }

    const operator = await this.prisma.user.findFirst({
      where: { id: targetOperator, tenantId: user.tenantId, isActive: true },
      select: { id: true, sipExtension: true },
    });
    if (!operator?.sipExtension) {
      throw new BadRequestException('Operatorga SIP raqami biriktirilmagan');
    }

    return this.telephony.originate({
      to: normalized,
      operatorId: operator.id,
      contactId,
    });
  }

  async control(
    user: AuthUser,
    callId: string,
    action: 'answer' | 'hangup' | 'hold' | 'unhold' | 'mute' | 'unmute',
  ): Promise<void> {
    await this.assertCallAccess(user, callId, 'call:control');

    switch (action) {
      case 'answer':
        return this.telephony.answer(callId);
      case 'hangup':
        return this.telephony.hangup(callId);
      case 'hold':
        return this.telephony.hold(callId, true);
      case 'unhold':
        return this.telephony.hold(callId, false);
      case 'mute':
        return this.telephony.mute(callId, true);
      case 'unmute':
        return this.telephony.mute(callId, false);
    }
  }

  async transfer(user: AuthUser, callId: string, target: string, mode: 'blind' | 'attended') {
    await this.assertCallAccess(user, callId, 'call:control');
    return this.telephony.transfer({ callId, target, mode });
  }

  async sendDtmf(user: AuthUser, callId: string, digits: string) {
    await this.assertCallAccess(user, callId, 'call:control');
    return this.telephony.sendDtmf(callId, digits);
  }

  /** Supervisor: tinglash / pichirlash / suhbatga kirish. */
  async spy(user: AuthUser, callId: string, mode: 'listen' | 'whisper' | 'barge') {
    const permission =
      mode === 'listen' ? 'call:listen' : mode === 'whisper' ? 'call:whisper' : 'call:barge';
    if (!hasPermission(user.roles, permission)) {
      throw new ForbiddenException(`"${mode}" rejimiga ruxsat yo'q`);
    }

    // Cross-tenant eavesdrop oldini olish.
    const call = await this.prisma.call.findFirst({
      where: { id: callId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!call) {
      const active = await this.telephony.activeCalls().catch(() => []);
      const live = active.find((item) => item.callId === callId && item.tenantId === user.tenantId);
      if (!live) throw new NotFoundException("Qo'ng'iroq topilmadi");
    }

    const supervisor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { sipExtension: true },
    });
    if (!supervisor?.sipExtension) {
      throw new BadRequestException('Supervisorga SIP raqami biriktirilmagan');
    }

    return this.telephony.spy(callId, supervisor.sipExtension, mode);
  }

  async startMediaFork(user: AuthUser, callId: string) {
    await this.assertCallAccess(user, callId, 'call:control');
    return this.telephony.startMediaFork(callId, {
      host: this.audioSocketHost,
      port: this.audioSocketPort,
      format: 'slin16',
      transport: 'audiosocket',
    });
  }

  async addNote(user: AuthUser, callId: string, notes: string) {
    await this.assertCallAccess(user, callId, 'call:read:own');
    return this.prisma.call.update({
      where: { id: callId },
      data: { notes },
      select: { id: true, notes: true },
    });
  }

  /**
   * Faol qo'ng'iroq bazada hali bo'lmasligi mumkin (hodisa yetib kelmagan),
   * shuning uchun avval telefoniya servisidan tekshiriladi.
   */
  private async assertCallAccess(
    user: AuthUser,
    callId: string,
    permission: Parameters<typeof hasPermission>[1],
  ): Promise<void> {
    if (!hasPermission(user.roles, permission)) {
      throw new ForbiddenException("Bu amalga ruxsat yo'q");
    }
    if (resolveScope(user.roles, 'call', 'read') === 'all') return;

    const active = await this.telephony.activeCalls().catch(() => []);
    const live = active.find((call) => call.callId === callId);
    if (live) {
      if (live.tenantId !== user.tenantId || live.operatorId !== user.id) {
        throw new ForbiddenException("Bu qo'ng'iroq sizga tegishli emas");
      }
      return;
    }

    const call = await this.prisma.call.findFirst({
      where: { id: callId, tenantId: user.tenantId },
      select: { operatorId: true },
    });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi");
    if (call.operatorId !== user.id) {
      throw new ForbiddenException("Bu qo'ng'iroq sizga tegishli emas");
    }
  }
}

export type { Role };
