import { Injectable, Logger } from '@nestjs/common';
import { countSmsSegments, SendSmsRequest, SmsProvider, SmsSendResult } from '@aicc/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Qurilma shu vaqt ichida heartbeat yubormasa oflayn deb hisoblanadi. */
const ONLINE_WINDOW_MS = 90_000;

/**
 * Android Companion ilovasi orqali yuborish. Ilova NAT ortida turgani uchun
 * server unga to'g'ridan-to'g'ri murojaat qilmaydi: xabar `QUEUED` holatida
 * saqlanadi, qurilma esa `/devices/outbox` dan olib SIM orqali jo'natadi va
 * natijani `/devices/sms/status` ga qaytaradi.
 */
@Injectable()
export class AndroidCompanionSmsProvider implements SmsProvider {
  readonly name = 'android';
  readonly supportsDeliveryReports = true;

  private readonly logger = new Logger(AndroidCompanionSmsProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(request: SendSmsRequest): Promise<SmsSendResult> {
    const { segments } = countSmsSegments(request.text);
    // Haqiqiy jo'natishni qurilma bajaradi; bu yerda faqat navbatga qo'yiladi.
    this.logger.debug(`SMS navbatga qo'yildi: ${request.to} (${segments} segment)`);
    return { providerMessageId: '', status: 'QUEUED', segments };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const available = await this.prisma.device.count({
      where: {
        kind: 'ANDROID_COMPANION',
        isActive: true,
        lastSeenAt: { gte: since },
      },
    });

    return available > 0
      ? { healthy: true }
      : { healthy: false, detail: "Onlayn Android qurilma yo'q" };
  }

  /** Xabar uchun mos qurilmani tanlaydi: operatorniki ustuvor, keyin eng bo'shi. */
  async pickDevice(params: {
    tenantId: string;
    operatorId?: string;
    deviceId?: string;
  }): Promise<{ id: string; simSlots: number } | null> {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const base = {
      tenantId: params.tenantId,
      kind: 'ANDROID_COMPANION' as const,
      isActive: true,
      lastSeenAt: { gte: since },
    };

    if (params.deviceId) {
      return this.prisma.device.findFirst({
        where: { ...base, id: params.deviceId },
        select: { id: true, simSlots: true },
      });
    }

    if (params.operatorId) {
      const own = await this.prisma.device.findFirst({
        where: { ...base, operatorId: params.operatorId },
        select: { id: true, simSlots: true },
      });
      if (own) return own;
    }

    // Bugun eng kam SMS yuborgan qurilmani tanlaymiz — SIM limitlari teng taqsimlanadi.
    const devices = await this.prisma.device.findMany({
      where: base,
      select: {
        id: true,
        simSlots: true,
        _count: {
          select: {
            sms: {
              where: {
                direction: 'OUTBOUND',
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
              },
            },
          },
        },
      },
    });

    return (
      devices
        .sort((a, b) => a._count.sms - b._count.sms)
        .map(({ id, simSlots }) => ({ id, simSlots }))[0] ?? null
    );
  }
}
