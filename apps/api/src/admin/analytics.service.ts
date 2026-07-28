import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type { analyticsRangeSchema } from './admin.dto';

type RangeInput = z.infer<typeof analyticsRangeSchema>;

/** Real vaqt panelida "hozir" deb hisoblanadigan oyna. */
const LIVE_WINDOW_MS = 90_000;

export interface KpiSummary {
  from: string;
  to: string;
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  missedRate: number;
  /** Average Handle Time: suhbat + qayta ishlash vaqti, soniyalarda. */
  aht: number;
  avgWaitSec: number;
  /** SLA ichida javob berilgan qo'ng'iroqlar ulushi. */
  slaRate: number;
  inbound: number;
  outbound: number;
  smsSent: number;
  smsDelivered: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ish stoli uchun jonli holat: faol qo'ng'iroqlar, navbat, operatorlar. */
  async realtime(user: AuthUser) {
    const dayStart = startOfDay();

    const [active, waiting, operators, devices, todayStats] = await Promise.all([
      this.prisma.call.findMany({
        where: {
          tenantId: user.tenantId,
          state: { in: ['RINGING', 'ANSWERED', 'HELD', 'TRANSFERRING'] },
        },
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          direction: true,
          state: true,
          fromNumber: true,
          toNumber: true,
          startedAt: true,
          answeredAt: true,
          operator: { select: { id: true, fullName: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          queue: { select: { id: true, name: true } },
        },
      }),
      // Navbatda kutayotgan qo'ng'iroq: navbatga tushgan, lekin hali operator olmagan.
      this.prisma.call.count({
        where: {
          tenantId: user.tenantId,
          state: 'RINGING',
          queueId: { not: null },
          answeredAt: null,
        },
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        where: { tenantId: user.tenantId, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.device.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          lastSeenAt: true,
          batteryLevel: true,
          signalStrength: true,
        },
      }),
      this.dayStats(user.tenantId, dayStart),
    ]);

    const threshold = Date.now() - LIVE_WINDOW_MS;

    return {
      activeCalls: active,
      queuedCalls: waiting,
      operators: Object.fromEntries(operators.map((row) => [row.status, row._count._all])),
      devices: {
        total: devices.length,
        online: devices.filter((d) => d.lastSeenAt && d.lastSeenAt.getTime() >= threshold).length,
        lowBattery: devices.filter((d) => (d.batteryLevel ?? 100) < 20).length,
      },
      today: todayStats,
    };
  }

  /** Tanlangan davr uchun KPI: AHT, SLA, o'tkazib yuborilganlar. */
  async summary(user: AuthUser, range: RangeInput): Promise<KpiSummary> {
    const scoped = this.scopeRange(user, range);
    const { from, to } = resolveRange(scoped);
    const where = this.callWhere(user.tenantId, from, to, scoped);

    const [aggregate, answered, missed, byDirection, slaCount, sms] = await Promise.all([
      this.prisma.call.aggregate({
        where,
        _count: { _all: true },
        _avg: { talkTimeSec: true, waitTimeSec: true },
      }),
      this.prisma.call.count({ where: { ...where, disposition: 'ANSWERED' } }),
      this.prisma.call.count({ where: { ...where, disposition: { in: ['NO_ANSWER', 'BUSY'] } } }),
      this.prisma.call.groupBy({
        by: ['direction'],
        where,
        _count: { _all: true },
      }),
      // SLA: 20 soniyagacha javob berilgan kiruvchi qo'ng'iroqlar.
      this.prisma.call.count({
        where: { ...where, disposition: 'ANSWERED', waitTimeSec: { lte: 20 } },
      }),
      this.prisma.smsMessage.groupBy({
        by: ['status'],
        where: {
          tenantId: user.tenantId,
          direction: 'OUTBOUND',
          createdAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
    ]);

    const total = aggregate._count._all;
    const smsByStatus = Object.fromEntries(sms.map((row) => [row.status, row._count._all]));
    const delivered = smsByStatus.DELIVERED ?? 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalCalls: total,
      answeredCalls: answered,
      missedCalls: missed,
      missedRate: total > 0 ? round(missed / total) : 0,
      aht: Math.round(aggregate._avg.talkTimeSec ?? 0),
      avgWaitSec: Math.round(aggregate._avg.waitTimeSec ?? 0),
      slaRate: answered > 0 ? round(slaCount / answered) : 0,
      inbound: byDirection.find((row) => row.direction === 'INBOUND')?._count._all ?? 0,
      outbound: byDirection.find((row) => row.direction === 'OUTBOUND')?._count._all ?? 0,
      smsSent: (smsByStatus.SENT ?? 0) + delivered,
      smsDelivered: delivered,
    };
  }

  /** Operatorlar reytingi — gamifikatsiya va coaching uchun asos. */
  async operators(user: AuthUser, range: RangeInput) {
    const { from, to } = resolveRange(range);

    const [rows, users, breaks] = await Promise.all([
      this.prisma.call.groupBy({
        by: ['operatorId'],
        where: {
          ...this.callWhere(user.tenantId, from, to, range),
          operatorId: { not: null },
        },
        _count: { _all: true },
        _sum: { talkTimeSec: true },
        _avg: { talkTimeSec: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, fullName: true, roles: true, status: true },
      }),
      this.prisma.operatorStatusEvent.groupBy({
        by: ['userId'],
        where: {
          tenantId: user.tenantId,
          status: 'BREAK',
          startedAt: { gte: from, lte: to },
        },
        _sum: { durationSec: true },
      }),
    ]);

    const byOperator = new Map(rows.map((row) => [row.operatorId, row]));
    const breakByOperator = new Map(breaks.map((row) => [row.userId, row._sum.durationSec ?? 0]));

    // Faqat qo'ng'iroq qilganlar emas, barcha operatorlar ko'rsatiladi (nol bilan).
    const answeredCounts = await this.prisma.call.groupBy({
      by: ['operatorId'],
      where: {
        ...this.callWhere(user.tenantId, from, to, range),
        disposition: 'ANSWERED',
        operatorId: { not: null },
      },
      _count: { _all: true },
    });
    const answeredMap = new Map(answeredCounts.map((row) => [row.operatorId, row._count._all]));

    return users
      .map((operator) => {
        const stats = byOperator.get(operator.id);
        const calls = stats?._count._all ?? 0;
        const answered = answeredMap.get(operator.id) ?? 0;

        return {
          id: operator.id,
          fullName: operator.fullName,
          roles: operator.roles,
          status: operator.status,
          calls,
          answered,
          missed: calls - answered,
          talkTimeSec: stats?._sum.talkTimeSec ?? 0,
          aht: Math.round(stats?._avg.talkTimeSec ?? 0),
          breakSec: breakByOperator.get(operator.id) ?? 0,
        };
      })
      .sort((a, b) => b.answered - a.answered || a.fullName.localeCompare(b.fullName));
  }

  /** Soatlik taqsimot — smena rejalashtirish uchun. */
  async hourly(user: AuthUser, range: RangeInput) {
    const scoped = this.scopeRange(user, range);
    const { from, to } = resolveRange(scoped);
    const operatorFilter = scoped.operatorId
      ? Prisma.sql`AND "operatorId" = ${scoped.operatorId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ hour: number; total: bigint; answered: bigint }>
    >(
      Prisma.sql`
        SELECT
          EXTRACT(HOUR FROM "startedAt")::int AS hour,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE "disposition" = 'ANSWERED')::bigint AS answered
        FROM "calls"
        WHERE "tenantId" = ${user.tenantId}
          AND "startedAt" >= ${from}
          AND "startedAt" <= ${to}
          ${operatorFilter}
        GROUP BY 1
        ORDER BY 1
      `,
    );

    const byHour = new Map(rows.map((row) => [row.hour, row]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: Number(byHour.get(hour)?.total ?? 0),
      answered: Number(byHour.get(hour)?.answered ?? 0),
    }));
  }

  private async dayStats(tenantId: string, from: Date) {
    const [total, answered, missed, aggregate] = await Promise.all([
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: from } } }),
      this.prisma.call.count({
        where: { tenantId, startedAt: { gte: from }, disposition: 'ANSWERED' },
      }),
      this.prisma.call.count({
        where: { tenantId, startedAt: { gte: from }, disposition: { in: ['NO_ANSWER', 'BUSY'] } },
      }),
      this.prisma.call.aggregate({
        where: { tenantId, startedAt: { gte: from }, disposition: 'ANSWERED' },
        _avg: { talkTimeSec: true, waitTimeSec: true },
      }),
    ]);

    return {
      totalCalls: total,
      answeredCalls: answered,
      missedCalls: missed,
      aht: Math.round(aggregate._avg.talkTimeSec ?? 0),
      avgWaitSec: Math.round(aggregate._avg.waitTimeSec ?? 0),
    };
  }

  private callWhere(
    tenantId: string,
    from: Date,
    to: Date,
    range: RangeInput,
  ): Prisma.CallWhereInput {
    return {
      tenantId,
      startedAt: { gte: from, lte: to },
      ...(range.queueId ? { queueId: range.queueId } : {}),
      ...(range.operatorId ? { operatorId: range.operatorId } : {}),
    };
  }

  /** Faqat o'z analitikasiga ruxsati bor operator uchun operatorId majburiy. */
  private scopeRange(user: AuthUser, range: RangeInput): RangeInput {
    if (
      !hasPermission(user.roles, 'analytics:read:all') &&
      hasPermission(user.roles, 'analytics:read:own')
    ) {
      return { ...range, operatorId: user.id };
    }
    return range;
  }
}

function startOfDay(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function resolveRange(range: RangeInput): { from: Date; to: Date } {
  const to = range.to ? new Date(range.to) : new Date();
  // Standart oyna — oxirgi 7 kun.
  const from = range.from ? new Date(range.from) : new Date(to.getTime() - 7 * 86_400_000);
  return { from, to };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
