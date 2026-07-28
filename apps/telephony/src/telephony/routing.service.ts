import { Injectable, Logger } from '@nestjs/common';
import { phoneSearchKey } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RoutedOperator {
  userId: string;
  extension: string;
  fullName: string;
}

/**
 * ACD — kiruvchi qo'ng'iroqni operatorlar orasida taqsimlash.
 * Faqat `AVAILABLE` holatidagi va SIP raqami biriktirilgan operatorlar tanlanadi.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantByTrunk(trunk: string | undefined): Promise<string | null> {
    // MVP da bitta tenant; kelajakda trunk -> tenant jadvali orqali aniqlanadi.
    const tenant = await this.prisma.tenant.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!tenant) this.logger.error(`Faol tenant topilmadi (trunk=${trunk ?? "noma'lum"})`);
    return tenant?.id ?? null;
  }

  async findQueueByExtension(tenantId: string, extension: string) {
    return this.prisma.queue.findFirst({
      where: { tenantId, extension, isActive: true },
    });
  }

  async findContactByPhone(tenantId: string, phone: string): Promise<string | null> {
    const key = phoneSearchKey(phone);
    if (key.length < 7) return null;

    // Raqam turli formatda saqlangan bo'lishi mumkin, shuning uchun oxirgi
    // 9 raqam bo'yicha ham qidiriladi (mahalliy raqam uzunligi).
    const tail = key.slice(-9);
    const match = await this.prisma.contactPhone.findFirst({
      where: { tenantId, phoneKey: { endsWith: tail } },
      select: { contactId: true },
    });
    return match?.contactId ?? null;
  }

  /** Belgilangan operator bandmi yoki yo'qmi tekshiradi. */
  async getOperatorById(tenantId: string, userId: string): Promise<RoutedOperator | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true, sipExtension: { not: null } },
      select: { id: true, sipExtension: true, fullName: true },
    });
    if (!user?.sipExtension) return null;
    return { userId: user.id, extension: user.sipExtension, fullName: user.fullName };
  }

  /** Brauzer softfoni qaysi foydalanuvchiga tegishli ekanini SIP raqamidan aniqlaydi. */
  async getOperatorByExtension(
    tenantId: string,
    extension: string,
  ): Promise<RoutedOperator | null> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, sipExtension: extension, isActive: true },
      select: { id: true, sipExtension: true, fullName: true },
    });
    if (!user?.sipExtension) return null;
    return { userId: user.id, extension: user.sipExtension, fullName: user.fullName };
  }

  async selectOperator(
    tenantId: string,
    strategy: string = 'round_robin',
  ): Promise<RoutedOperator | null> {
    const candidates = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        status: 'AVAILABLE',
        sipExtension: { not: null },
        roles: { hasSome: ['OPERATOR', 'SUPERVISOR'] },
      },
      select: { id: true, sipExtension: true, fullName: true, statusChangedAt: true },
    });

    if (candidates.length === 0) {
      this.logger.warn(`Bo'sh operator yo'q (tenant=${tenantId})`);
      return null;
    }

    let chosen = candidates[0]!;

    switch (strategy) {
      case 'fewest_calls': {
        // Bugungi qo'ng'iroqlar soni eng kam bo'lgan operator.
        const since = new Date();
        since.setHours(0, 0, 0, 0);
        const counts = await this.prisma.call.groupBy({
          by: ['operatorId'],
          where: { tenantId, startedAt: { gte: since }, operatorId: { not: null } },
          _count: { _all: true },
        });
        const countByOperator = new Map(counts.map((row) => [row.operatorId!, row._count._all]));
        chosen = candidates.reduce((best, candidate) =>
          (countByOperator.get(candidate.id) ?? 0) < (countByOperator.get(best.id) ?? 0)
            ? candidate
            : best,
        );
        break;
      }

      case 'least_recent': {
        // Eng uzoq vaqt qo'ng'iroq qabul qilmagan operator.
        const lastCalls = await this.prisma.call.groupBy({
          by: ['operatorId'],
          where: { tenantId, operatorId: { in: candidates.map((c) => c.id) } },
          _max: { startedAt: true },
        });
        const lastByOperator = new Map(
          lastCalls.map((row) => [row.operatorId!, row._max.startedAt?.getTime() ?? 0]),
        );
        chosen = candidates.reduce((best, candidate) =>
          (lastByOperator.get(candidate.id) ?? 0) < (lastByOperator.get(best.id) ?? 0)
            ? candidate
            : best,
        );
        break;
      }

      case 'round_robin':
      default: {
        // Eng uzoq vaqtdan beri "bo'sh" holatda turgan operator.
        chosen = candidates.reduce((best, candidate) =>
          candidate.statusChangedAt < best.statusChangedAt ? candidate : best,
        );
        break;
      }
    }

    return {
      userId: chosen.id,
      extension: chosen.sipExtension!,
      fullName: chosen.fullName,
    };
  }
}
