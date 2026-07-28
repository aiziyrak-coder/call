import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizePhone } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { hashToken, DeviceContext } from './device-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type { deviceWriteSchema, enrollSchema, heartbeatSchema } from './devices.dto';

type EnrollInput = z.infer<typeof enrollSchema>;
type HeartbeatInput = z.infer<typeof heartbeatSchema>;
type DeviceWrite = z.infer<typeof deviceWriteSchema>;

/** Heartbeat oralig'i 30 s; uch marta o'tkazib yuborilsa qurilma oflayn. */
const ONLINE_WINDOW_MS = 90_000;
const OUTBOX_BATCH = 20;

/** Qurilmaga heartbeat javobida yuboriladigan buyruqlar (MDM). */
export type DeviceCommand =
  { type: 'call'; number: string; simSlot?: number } | { type: 'restart' } | { type: 'sync' };

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
  /**
   * Buyruqlar navbati xotirada: ular qisqa umrli va qurilma bir necha soniyada
   * oladi. Qayta ishga tushirishda yo'qolishi muammo emas — operator qaytadan bosadi.
   */
  private readonly commands = new Map<string, DeviceCommand[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async enroll(input: EnrollInput): Promise<{ deviceId: string; deviceToken: string }> {
    const secret = this.config.getOrThrow<string>('DEVICE_ENROLLMENT_SECRET');
    if (input.enrollmentSecret !== secret) {
      throw new UnauthorizedException("Ro'yxatdan o'tish siri noto'g'ri");
    }

    const tenant = input.tenantSlug
      ? await this.prisma.tenant.findFirst({ where: { slug: input.tenantSlug, isActive: true } })
      : await this.prisma.tenant.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        });
    if (!tenant) throw new BadRequestException('Tashkilot topilmadi');

    const operator = input.operatorEmail
      ? await this.prisma.user.findFirst({
          where: { tenantId: tenant.id, email: input.operatorEmail.toLowerCase() },
          select: { id: true },
        })
      : null;

    const deviceToken = randomBytes(32).toString('hex');
    const phoneNumbers = input.phoneNumbers
      .map((phone) => normalizePhone(phone))
      .filter((phone): phone is string => Boolean(phone));

    const device = await this.prisma.device.upsert({
      where: { tenantId_hardwareId: { tenantId: tenant.id, hardwareId: input.hardwareId } },
      update: {
        name: input.name,
        phoneNumbers,
        simSlots: input.simSlots,
        appVersion: input.appVersion,
        authTokenHash: hashToken(deviceToken),
        isActive: true,
        operatorId: operator?.id ?? undefined,
      },
      create: {
        tenantId: tenant.id,
        kind: 'ANDROID_COMPANION',
        name: input.name,
        hardwareId: input.hardwareId,
        phoneNumbers,
        simSlots: input.simSlots,
        appVersion: input.appVersion,
        authTokenHash: hashToken(deviceToken),
        operatorId: operator?.id ?? null,
      },
    });

    this.logger.log(`Qurilma ro'yxatdan o'tdi: ${device.name} (${device.id})`);
    return { deviceId: device.id, deviceToken };
  }

  async heartbeat(device: DeviceContext, input: HeartbeatInput) {
    const phoneNumbers = input.phoneNumbers
      ?.map((phone) => normalizePhone(phone))
      .filter((phone): phone is string => Boolean(phone));

    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        online: true,
        lastSeenAt: new Date(),
        batteryLevel: input.batteryLevel,
        signalStrength: input.signalStrength,
        networkType: input.networkType,
        appVersion: input.appVersion,
        ...(phoneNumbers ? { phoneNumbers } : {}),
      },
      select: {
        id: true,
        batteryLevel: true,
        signalStrength: true,
        networkType: true,
        appVersion: true,
      },
    });

    this.gateway.emitEvent({
      type: 'device.status',
      tenantId: device.tenantId,
      eventId: `${device.id}:${Date.now()}`,
      occurredAt: new Date().toISOString(),
      deviceId: device.id,
      online: true,
      batteryLevel: updated.batteryLevel ?? undefined,
      signalStrength: updated.signalStrength ?? undefined,
      networkType: updated.networkType ?? undefined,
      appVersion: updated.appVersion ?? undefined,
    });

    const pending = this.commands.get(device.id) ?? [];
    this.commands.delete(device.id);

    return { ok: true, intervalSec: 30, commands: pending };
  }

  /** Qurilma jo'natishi kerak bo'lgan navbatdagi SMS lar. */
  async outbox(device: DeviceContext) {
    const messages = await this.prisma.smsMessage.findMany({
      where: {
        tenantId: device.tenantId,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        // Qurilmaga biriktirilgan yoki hali hech kimga tegishli bo'lmagan xabarlar.
        OR: [{ deviceId: device.id }, { deviceId: null, provider: 'android' }],
      },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH,
      select: { id: true, toNumber: true, text: true, simSlot: true },
    });

    if (messages.length === 0) return { messages: [] };

    // Ikkita qurilma bir xabarni ikki marta yubormasligi uchun darhol band qilamiz.
    await this.prisma.smsMessage.updateMany({
      where: { id: { in: messages.map((message) => message.id) } },
      data: { deviceId: device.id, status: 'SENDING', provider: 'android' },
    });

    return {
      messages: messages.map((message) => ({
        id: message.id,
        to: message.toNumber,
        text: message.text,
        simSlot: message.simSlot ?? 0,
      })),
    };
  }

  /** Click-to-call zaxira kanali: qurilmaga terish buyrug'i qo'yiladi. */
  async requestCall(user: AuthUser, number: string, simSlot?: number) {
    const normalized = normalizePhone(number);
    if (!normalized) throw new BadRequestException("Telefon raqami noto'g'ri");

    const device = await this.prisma.device.findFirst({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) },
        OR: [{ operatorId: user.id }, { operatorId: null }],
      },
      orderBy: { operatorId: 'desc' },
      select: { id: true, name: true },
    });
    if (!device) throw new BadRequestException('Onlayn qurilma topilmadi');

    this.enqueue(device.id, { type: 'call', number: normalized, simSlot });
    return { deviceId: device.id, deviceName: device.name, number: normalized };
  }

  enqueue(deviceId: string, command: DeviceCommand): void {
    const queue = this.commands.get(deviceId) ?? [];
    queue.push(command);
    this.commands.set(deviceId, queue);
  }

  // ------------------------------------------------------------------ admin

  async list(user: AuthUser) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        kind: true,
        name: true,
        hardwareId: true,
        phoneNumbers: true,
        simSlots: true,
        batteryLevel: true,
        signalStrength: true,
        networkType: true,
        appVersion: true,
        lastSeenAt: true,
        isActive: true,
        operator: { select: { id: true, fullName: true } },
      },
    });

    const threshold = Date.now() - ONLINE_WINDOW_MS;
    return devices.map((device) => ({
      ...device,
      // `online` ustuni eskirishi mumkin — haqiqiy holat lastSeenAt dan hisoblanadi.
      online: device.lastSeenAt ? device.lastSeenAt.getTime() >= threshold : false,
    }));
  }

  async update(user: AuthUser, id: string, input: DeviceWrite) {
    const existing = await this.prisma.device.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Qurilma topilmadi');

    return this.prisma.device.update({
      where: { id },
      data: {
        name: input.name,
        operatorId: input.operatorId === undefined ? undefined : input.operatorId,
        isActive: input.isActive,
      },
    });
  }

  async restart(user: AuthUser, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Qurilma topilmadi');

    this.enqueue(device.id, { type: 'restart' });
    return { queued: true };
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const result = await this.prisma.device.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (result.count === 0) throw new NotFoundException('Qurilma topilmadi');
  }
}
