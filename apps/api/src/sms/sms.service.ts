import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  countSmsSegments,
  normalizePhone,
  phoneSearchKey,
  renderSmsTemplate,
  SmsStatus,
} from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { scopedWhere } from '../common/tenant-scope';
import { skipTake, toPage, Page } from '../common/pagination';
import { SmsProviderRegistry } from './providers/sms-provider.registry';
import { AndroidCompanionSmsProvider } from './providers/android-companion.provider';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type { bulkSmsSchema, sendSmsSchema, smsListSchema, templateWriteSchema } from './sms.dto';

type SendInput = z.infer<typeof sendSmsSchema>;
type BulkInput = z.infer<typeof bulkSmsSchema>;
type ListInput = z.infer<typeof smsListSchema>;
type TemplateInput = z.infer<typeof templateWriteSchema>;

const SMS_SELECT = {
  id: true,
  direction: true,
  status: true,
  fromNumber: true,
  toNumber: true,
  text: true,
  segments: true,
  provider: true,
  error: true,
  simSlot: true,
  sentAt: true,
  deliveredAt: true,
  createdAt: true,
  contact: { select: { id: true, firstName: true, lastName: true, company: true } },
  sender: { select: { id: true, fullName: true } },
  device: { select: { id: true, name: true } },
} satisfies Prisma.SmsMessageSelect;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: SmsProviderRegistry,
    private readonly android: AndroidCompanionSmsProvider,
    private readonly gateway: RealtimeGateway,
  ) {}

  async list(user: AuthUser, query: ListInput): Promise<Page<unknown>> {
    const where: Prisma.SmsMessageWhereInput = scopedWhere(user, 'sms', 'read', 'senderId');
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.contactId) where.contactId = query.contactId;
    if (query.search) {
      const digits = phoneSearchKey(query.search);
      where.OR = [
        { text: { contains: query.search, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ peerKey: { contains: digits } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where,
        select: SMS_SELECT,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query),
      }),
      this.prisma.smsMessage.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  /** Bitta SMS: shablon ochiladi, provayder tanlanadi, natija bazaga yoziladi. */
  async send(user: AuthUser, input: SendInput) {
    const to = normalizePhone(input.to);
    if (!to) throw new BadRequestException("Telefon raqami noto'g'ri");

    const text = await this.resolveText(user, input.text, input.templateId, input.variables);
    const contactId = input.contactId ?? (await this.findContactId(user.tenantId, to));

    const provider = input.deviceId
      ? this.providers.byName('android')!
      : await this.providers.pick();

    const device =
      provider.name === 'android'
        ? await this.android.pickDevice({
            tenantId: user.tenantId,
            operatorId: user.id,
            deviceId: input.deviceId,
          })
        : null;

    if (provider.name === 'android' && !device) {
      throw new BadRequestException('Onlayn Android qurilma topilmadi');
    }

    const { segments } = countSmsSegments(text);

    const message = await this.prisma.smsMessage.create({
      data: {
        tenantId: user.tenantId,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        fromNumber: device?.id ? 'device' : 'system',
        toNumber: to,
        peerKey: phoneSearchKey(to),
        text,
        segments,
        contactId,
        senderId: user.id,
        deviceId: device?.id ?? null,
        simSlot: input.simSlot ?? null,
        provider: provider.name,
      },
      select: SMS_SELECT,
    });

    // Android holatida qurilma outbox'dan olib ketadi; qolganlarida darhol yuboramiz.
    if (provider.name !== 'android') {
      try {
        const result = await provider.send({
          to,
          text,
          contactId: contactId ?? undefined,
          simSlot: input.simSlot,
        });
        await this.markSent(message.id, result.status, result.providerMessageId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.markFailed(message.id, detail);
        this.logger.error(`SMS yuborilmadi (${provider.name}): ${detail}`);
        throw new BadRequestException(`SMS yuborilmadi: ${detail}`);
      }
    }

    await this.recordActivity(user.tenantId, contactId, user.id, 'Chiquvchi SMS', text);
    return this.prisma.smsMessage.findUniqueOrThrow({
      where: { id: message.id },
      select: SMS_SELECT,
    });
  }

  /** Ommaviy yuborish: segment bo'yicha navbatga qo'yiladi, har biri alohida yozuv. */
  async sendBulk(user: AuthUser, input: BulkInput) {
    const contacts = await this.resolveAudience(user, input);
    if (contacts.length === 0) throw new BadRequestException("Segment bo'yicha mijoz topilmadi");

    const template = input.templateId
      ? await this.prisma.smsTemplate.findFirst({
          where: { id: input.templateId, tenantId: user.tenantId },
        })
      : null;
    const body = template?.body ?? input.text;
    if (!body) throw new BadRequestException("Matn yoki shablon ko'rsatilishi kerak");

    let queued = 0;
    const skipped: Array<{ contactId: string; reason: string }> = [];

    for (const contact of contacts) {
      const phone = contact.phones[0]?.phone;
      if (!phone) {
        skipped.push({ contactId: contact.id, reason: "Raqam yo'q" });
        continue;
      }

      // Har bir mijoz uchun shablon o'z ismi bilan to'ldiriladi.
      const text = renderSmsTemplate(body, {
        ism: contact.firstName,
        familiya: contact.lastName ?? '',
        kompaniya: contact.company ?? '',
        ...input.variables,
      });

      const device = await this.android.pickDevice({
        tenantId: user.tenantId,
        operatorId: user.id,
      });

      await this.prisma.smsMessage.create({
        data: {
          tenantId: user.tenantId,
          direction: 'OUTBOUND',
          status: 'QUEUED',
          fromNumber: 'system',
          toNumber: phone,
          peerKey: phoneSearchKey(phone),
          text,
          segments: countSmsSegments(text).segments,
          contactId: contact.id,
          senderId: user.id,
          deviceId: device?.id ?? null,
          provider: device ? 'android' : null,
        },
      });
      queued += 1;
    }

    return { queued, skipped, total: contacts.length };
  }

  /** Qurilma yoki shlyuz qabul qilgan SMS ni CRM ga biriktiradi. */
  async ingestInbound(params: {
    tenantId: string;
    from: string;
    to: string;
    text: string;
    receivedAt?: string;
    deviceId?: string;
    simSlot?: number;
  }) {
    const from = normalizePhone(params.from) ?? params.from;
    const peerKey = phoneSearchKey(from);
    const contactId = await this.findContactId(params.tenantId, from);

    const message = await this.prisma.smsMessage.create({
      data: {
        tenantId: params.tenantId,
        direction: 'INBOUND',
        status: 'RECEIVED',
        fromNumber: from,
        toNumber: params.to,
        peerKey,
        text: params.text,
        segments: countSmsSegments(params.text).segments,
        contactId,
        deviceId: params.deviceId ?? null,
        simSlot: params.simSlot ?? null,
        provider: params.deviceId ? 'android' : 'gateway',
        createdAt: params.receivedAt ? new Date(params.receivedAt) : undefined,
      },
      select: SMS_SELECT,
    });

    await this.recordActivity(params.tenantId, contactId, null, 'Kiruvchi SMS', params.text);

    // Operator darhol ko'rishi uchun barcha ulangan mijozlarga yuboriladi.
    this.gateway.emitEvent({
      type: 'sms.received',
      tenantId: params.tenantId,
      eventId: message.id,
      occurredAt: new Date().toISOString(),
      smsId: message.id,
      from,
      to: params.to,
      text: params.text,
      contactId: contactId ?? undefined,
    });

    return message;
  }

  /** Qurilma yoki agregator bergan yetkazilish statusi. */
  async updateStatus(params: {
    tenantId: string;
    smsId: string;
    status: SmsStatus;
    providerMessageId?: string;
    error?: string;
  }) {
    const message = await this.prisma.smsMessage.findFirst({
      where: { id: params.smsId, tenantId: params.tenantId },
      select: { id: true, senderId: true },
    });
    if (!message) throw new NotFoundException('SMS topilmadi');

    const updated = await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: params.status,
        providerMessageId: params.providerMessageId,
        error: params.error ?? null,
        sentAt: params.status === 'SENT' || params.status === 'DELIVERED' ? new Date() : undefined,
        deliveredAt: params.status === 'DELIVERED' ? new Date() : undefined,
      },
      select: SMS_SELECT,
    });

    this.gateway.emitEvent(
      {
        type: 'sms.status',
        tenantId: params.tenantId,
        eventId: `${message.id}:${params.status}`,
        occurredAt: new Date().toISOString(),
        smsId: message.id,
        status: params.status,
        error: params.error,
      },
      message.senderId ?? undefined,
    );

    return updated;
  }

  // ---------------------------------------------------------------- shablonlar

  async templates(user: AuthUser) {
    return this.prisma.smsTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(user: AuthUser, input: TemplateInput) {
    return this.prisma.smsTemplate.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        body: input.body,
        variables: extractVariables(input.body),
      },
    });
  }

  async updateTemplate(user: AuthUser, id: string, input: Partial<TemplateInput>) {
    const existing = await this.prisma.smsTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Shablon topilmadi');

    return this.prisma.smsTemplate.update({
      where: { id },
      data: {
        name: input.name,
        body: input.body,
        variables: input.body ? extractVariables(input.body) : undefined,
      },
    });
  }

  async removeTemplate(user: AuthUser, id: string): Promise<void> {
    const result = await this.prisma.smsTemplate.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (result.count === 0) throw new NotFoundException('Shablon topilmadi');
  }

  async providerStatus() {
    return this.providers.status();
  }

  // ------------------------------------------------------------------ ichki

  async markSent(smsId: string, status: SmsStatus, providerMessageId?: string): Promise<void> {
    await this.prisma.smsMessage.update({
      where: { id: smsId },
      data: {
        status,
        providerMessageId,
        sentAt: new Date(),
        deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
      },
    });
  }

  async markFailed(smsId: string, error: string): Promise<void> {
    await this.prisma.smsMessage.update({
      where: { id: smsId },
      data: { status: 'FAILED', error },
    });
  }

  private async resolveText(
    user: AuthUser,
    text: string | undefined,
    templateId: string | undefined,
    variables: Record<string, string> | undefined,
  ): Promise<string> {
    if (templateId) {
      const template = await this.prisma.smsTemplate.findFirst({
        where: { id: templateId, tenantId: user.tenantId },
      });
      if (!template) throw new NotFoundException('Shablon topilmadi');
      return renderSmsTemplate(template.body, variables ?? {});
    }
    if (!text) throw new BadRequestException("Matn yoki shablon ko'rsatilishi kerak");
    return variables ? renderSmsTemplate(text, variables) : text;
  }

  private async findContactId(tenantId: string, phone: string): Promise<string | null> {
    const key = phoneSearchKey(phone);
    if (!key) return null;
    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        mergedIntoId: null,
        OR: [{ primaryPhoneKey: key }, { phones: { some: { phoneKey: key } } }],
      },
      select: { id: true },
    });
    return contact?.id ?? null;
  }

  private async resolveAudience(user: AuthUser, input: BulkInput) {
    const where: Prisma.ContactWhereInput = { tenantId: user.tenantId, mergedIntoId: null };
    if (input.contactIds?.length) where.id = { in: input.contactIds };
    else if (input.tag) where.tags = { has: input.tag };
    else throw new BadRequestException("Kontaktlar ro'yxati yoki teg ko'rsatilishi kerak");

    return this.prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        phones: {
          select: { phone: true },
          orderBy: { isPrimary: 'desc' },
          take: 1,
        },
      },
      take: 5000,
    });
  }

  private async recordActivity(
    tenantId: string,
    contactId: string | null,
    actorId: string | null,
    title: string,
    body: string,
  ): Promise<void> {
    if (!contactId) return;
    await this.prisma.activity.create({
      data: { tenantId, kind: 'SMS', contactId, actorId, title, body },
    });
  }
}

function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}
