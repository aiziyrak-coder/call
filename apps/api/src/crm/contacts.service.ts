import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePhone, phoneSearchKey } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { scopedWhere } from '../common/tenant-scope';
import { skipTake, toPage, Page } from '../common/pagination';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type {
  contactListSchema,
  contactWriteSchema,
  importSchema,
  timelineSchema,
} from './crm.dto';

type ContactWrite = z.infer<typeof contactWriteSchema>;
type ContactList = z.infer<typeof contactListSchema>;
type TimelineQuery = z.infer<typeof timelineSchema>;
type ImportInput = z.infer<typeof importSchema>;

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  email: true,
  address: true,
  notes: true,
  tags: true,
  source: true,
  ownerId: true,
  primaryPhoneKey: true,
  mergedIntoId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  phones: {
    select: { id: true, phone: true, label: true, isPrimary: true },
    orderBy: { isPrimary: Prisma.SortOrder.desc },
  },
} satisfies Prisma.ContactSelect;

export interface TimelineEntry {
  id: string;
  kind: 'CALL' | 'SMS' | 'NOTE' | 'TASK' | 'DEAL_STAGE_CHANGED' | 'SYSTEM';
  title: string;
  body?: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ContactList): Promise<Page<unknown>> {
    const where: Prisma.ContactWhereInput = scopedWhere(user, 'contact', 'read');
    if (!query.includeMerged) where.mergedIntoId = null;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.tag) where.tags = { has: query.tag };

    if (query.search) {
      const term = query.search.trim();
      const digits = phoneSearchKey(term);
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { company: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        // Raqam bo'lagi bo'yicha ham qidiramiz — operator ko'pincha
        // mijozning oxirgi to'rt raqamini eslaydi.
        ...(digits.length >= 3 ? [{ phones: { some: { phoneKey: { contains: digits } } } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: CONTACT_SELECT,
        orderBy: { updatedAt: 'desc' },
        ...skipTake(query),
      }),
      this.prisma.contact.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  async get(user: AuthUser, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, ...scopedWhere(user, 'contact', 'read') },
      select: {
        ...CONTACT_SELECT,
        deals: {
          select: {
            id: true,
            title: true,
            amount: true,
            currency: true,
            closedAt: true,
            stage: { select: { id: true, name: true, kind: true, color: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        tasks: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          select: { id: true, title: true, dueAt: true, priority: true, status: true },
          orderBy: { dueAt: 'asc' },
          take: 20,
        },
      },
    });
    if (!contact) throw new NotFoundException('Kontakt topilmadi');
    return contact;
  }

  async create(user: AuthUser, input: ContactWrite) {
    const phones = this.normalizePhones(input.phones);

    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          tenantId: user.tenantId,
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company,
          email: input.email,
          address: input.address,
          notes: input.notes,
          tags: input.tags ?? [],
          source: input.source,
          ownerId: input.ownerId ?? user.id,
          primaryPhoneKey: phones.find((p) => p.isPrimary)?.phoneKey ?? phones[0]?.phoneKey,
          phones: {
            create: phones.map((phone) => ({
              tenantId: user.tenantId,
              phone: phone.phone,
              phoneKey: phone.phoneKey,
              label: phone.label,
              isPrimary: phone.isPrimary,
            })),
          },
        },
        select: CONTACT_SELECT,
      });

      await tx.activity.create({
        data: {
          tenantId: user.tenantId,
          kind: 'SYSTEM',
          contactId: contact.id,
          actorId: user.id,
          title: 'Kontakt yaratildi',
        },
      });

      return contact;
    });
  }

  async update(user: AuthUser, id: string, input: Partial<ContactWrite>) {
    const existing = await this.prisma.contact.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Kontakt topilmadi');

    const phones = input.phones ? this.normalizePhones(input.phones) : null;

    return this.prisma.$transaction(async (tx) => {
      if (phones) {
        await tx.contactPhone.deleteMany({ where: { contactId: id } });
        await tx.contactPhone.createMany({
          data: phones.map((phone) => ({
            tenantId: user.tenantId,
            contactId: id,
            phone: phone.phone,
            phoneKey: phone.phoneKey,
            label: phone.label,
            isPrimary: phone.isPrimary,
          })),
        });
      }

      return tx.contact.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company,
          email: input.email,
          address: input.address,
          notes: input.notes,
          tags: input.tags,
          source: input.source,
          ownerId: input.ownerId ?? undefined,
          ...(phones
            ? {
                primaryPhoneKey:
                  phones.find((p) => p.isPrimary)?.phoneKey ?? phones[0]?.phoneKey ?? null,
              }
            : {}),
        },
        select: CONTACT_SELECT,
      });
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const result = await this.prisma.contact.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (result.count === 0) throw new NotFoundException('Kontakt topilmadi');
  }

  /**
   * Kiruvchi qo'ng'iroqdagi screen-pop uchun: raqam bo'yicha kontaktni topadi
   * va so'nggi muomala tarixini qaytaradi. Topilmasa `null`.
   */
  async lookupByPhone(user: AuthUser, rawPhone: string) {
    const key = phoneSearchKey(normalizePhone(rawPhone) ?? rawPhone);
    if (!key) return null;

    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId: user.tenantId,
        mergedIntoId: null,
        OR: [{ primaryPhoneKey: key }, { phones: { some: { phoneKey: key } } }],
      },
      select: CONTACT_SELECT,
    });
    if (!contact) return null;

    const [lastCall, openTasks, openDeals] = await Promise.all([
      this.prisma.call.findFirst({
        where: { tenantId: user.tenantId, contactId: contact.id },
        select: { id: true, direction: true, startedAt: true, disposition: true, notes: true },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.task.count({
        where: {
          tenantId: user.tenantId,
          contactId: contact.id,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.deal.count({
        where: { tenantId: user.tenantId, contactId: contact.id, closedAt: null },
      }),
    ]);

    return { contact, lastCall, openTasks, openDeals };
  }

  /** Qo'ng'iroq, SMS, vazifa va izohlarni bitta xronologik lentaga birlashtiradi. */
  async timeline(
    user: AuthUser,
    contactId: string,
    query: TimelineQuery,
  ): Promise<TimelineEntry[]> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, ...scopedWhere(user, 'contact', 'read') },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Kontakt topilmadi');

    const before = query.before ?? new Date();

    const [activities, calls, messages] = await Promise.all([
      this.prisma.activity.findMany({
        // CALL va SMS yozuvlari o'z jadvalidan to'liqroq ma'lumot bilan olinadi,
        // shuning uchun ularning activity nusxasi lentada takrorlanmaydi.
        where: {
          tenantId: user.tenantId,
          contactId,
          occurredAt: { lt: before },
          kind: { notIn: ['CALL', 'SMS'] },
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          occurredAt: true,
          metadata: true,
          actor: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.call.findMany({
        where: { tenantId: user.tenantId, contactId, startedAt: { lt: before } },
        orderBy: { startedAt: 'desc' },
        take: query.limit,
        select: {
          id: true,
          direction: true,
          disposition: true,
          durationSec: true,
          talkTimeSec: true,
          startedAt: true,
          notes: true,
          operator: { select: { id: true, fullName: true } },
          recording: { select: { id: true, durationSec: true, format: true } },
        },
      }),
      this.prisma.smsMessage.findMany({
        where: { tenantId: user.tenantId, contactId, createdAt: { lt: before } },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        select: {
          id: true,
          direction: true,
          status: true,
          text: true,
          createdAt: true,
        },
      }),
    ]);

    const entries: TimelineEntry[] = [
      ...activities.map((activity) => ({
        id: `activity:${activity.id}`,
        kind: activity.kind as TimelineEntry['kind'],
        title: activity.title,
        body: activity.body ?? undefined,
        occurredAt: activity.occurredAt,
        metadata: { actor: activity.actor, ...(activity.metadata as object) },
      })),
      ...calls.map((call) => ({
        id: `call:${call.id}`,
        kind: 'CALL' as const,
        title:
          call.direction === 'INBOUND'
            ? "Kiruvchi qo'ng'iroq"
            : call.direction === 'OUTBOUND'
              ? "Chiquvchi qo'ng'iroq"
              : "Ichki qo'ng'iroq",
        body: call.notes ?? undefined,
        occurredAt: call.startedAt,
        metadata: {
          callId: call.id,
          direction: call.direction,
          disposition: call.disposition,
          durationSec: call.durationSec,
          talkTimeSec: call.talkTimeSec,
          operator: call.operator,
          recording: call.recording,
        },
      })),
      ...messages.map((sms) => ({
        id: `sms:${sms.id}`,
        kind: 'SMS' as const,
        title: sms.direction === 'INBOUND' ? 'Kiruvchi SMS' : 'Chiquvchi SMS',
        body: sms.text,
        occurredAt: sms.createdAt,
        metadata: { smsId: sms.id, status: sms.status, direction: sms.direction },
      })),
    ];

    return entries
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, query.limit);
  }

  async addNote(user: AuthUser, contactId: string, body: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Kontakt topilmadi');

    return this.prisma.activity.create({
      data: {
        tenantId: user.tenantId,
        kind: 'NOTE',
        contactId,
        actorId: user.id,
        title: 'Izoh',
        body,
      },
    });
  }

  /**
   * Bir xil telefon raqamiga ega kartochkalarni guruhlaydi. Raqam — call-markazda
   * eng ishonchli identifikator, shu sababli duplikat mezoni sifatida u olinadi.
   */
  async duplicates(user: AuthUser) {
    const groups = await this.prisma.contactPhone.groupBy({
      by: ['phoneKey'],
      where: { tenantId: user.tenantId, contact: { mergedIntoId: null } },
      _count: { contactId: true },
      having: { contactId: { _count: { gt: 1 } } },
      orderBy: { _count: { contactId: 'desc' } },
      take: 100,
    });
    if (groups.length === 0) return [];

    const keys = groups.map((group) => group.phoneKey);
    const phones = await this.prisma.contactPhone.findMany({
      where: { tenantId: user.tenantId, phoneKey: { in: keys }, contact: { mergedIntoId: null } },
      select: {
        phoneKey: true,
        phone: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            createdAt: true,
            _count: { select: { calls: true, deals: true } },
          },
        },
      },
    });

    const byKey = new Map<string, { phone: string; contacts: unknown[] }>();
    for (const row of phones) {
      const bucket = byKey.get(row.phoneKey) ?? { phone: row.phone, contacts: [] };
      // Bitta kontakt bir raqamni ikki marta yozgan bo'lishi mumkin.
      if (!bucket.contacts.some((c) => (c as { id: string }).id === row.contact.id)) {
        bucket.contacts.push(row.contact);
      }
      byKey.set(row.phoneKey, bucket);
    }

    return [...byKey.entries()]
      .filter(([, group]) => group.contacts.length > 1)
      .map(([phoneKey, group]) => ({ phoneKey, phone: group.phone, contacts: group.contacts }));
  }

  /**
   * `sourceId` kartochkasini `targetId` ga ko'chiradi: barcha aloqa tarixi,
   * bitimlar va vazifalar target'ga o'tadi, manba esa arxivda ishora sifatida qoladi
   * (eski havolalar ishlashi uchun o'chirilmaydi).
   */
  async merge(user: AuthUser, sourceId: string, targetId: string) {
    if (sourceId === targetId)
      throw new BadRequestException("Bir xil kontaktni birlashtirib bo'lmaydi");

    const [source, target] = await Promise.all([
      this.prisma.contact.findFirst({
        where: { id: sourceId, tenantId: user.tenantId },
        include: { phones: true },
      }),
      this.prisma.contact.findFirst({
        where: { id: targetId, tenantId: user.tenantId },
        include: { phones: true },
      }),
    ]);
    if (!source || !target) throw new NotFoundException('Kontakt topilmadi');

    return this.prisma.$transaction(async (tx) => {
      const existingKeys = new Set(target.phones.map((phone) => phone.phoneKey));
      const newPhones = source.phones.filter((phone) => !existingKeys.has(phone.phoneKey));
      if (newPhones.length > 0) {
        await tx.contactPhone.createMany({
          data: newPhones.map((phone) => ({
            tenantId: user.tenantId,
            contactId: targetId,
            phone: phone.phone,
            phoneKey: phone.phoneKey,
            label: phone.label,
            isPrimary: false,
          })),
        });
      }

      const relink = { where: { contactId: sourceId }, data: { contactId: targetId } };
      await tx.call.updateMany(relink);
      await tx.smsMessage.updateMany(relink);
      await tx.deal.updateMany(relink);
      await tx.task.updateMany(relink);
      await tx.activity.updateMany(relink);

      await tx.contact.update({
        where: { id: targetId },
        data: {
          // Target'da bo'sh qolgan maydonlarni manbadan to'ldiramiz.
          lastName: target.lastName ?? source.lastName,
          company: target.company ?? source.company,
          email: target.email ?? source.email,
          address: target.address ?? source.address,
          notes: [target.notes, source.notes].filter(Boolean).join('\n---\n') || null,
          tags: [...new Set([...target.tags, ...source.tags])],
        },
      });

      await tx.contact.update({
        where: { id: sourceId },
        data: { mergedIntoId: targetId },
      });

      await tx.activity.create({
        data: {
          tenantId: user.tenantId,
          kind: 'SYSTEM',
          contactId: targetId,
          actorId: user.id,
          title: 'Duplikat kartochka birlashtirildi',
          metadata: { sourceId, sourceName: `${source.firstName} ${source.lastName ?? ''}`.trim() },
        },
      });

      return tx.contact.findUniqueOrThrow({ where: { id: targetId }, select: CONTACT_SELECT });
    });
  }

  async exportCsv(user: AuthUser): Promise<string> {
    const contacts = await this.prisma.contact.findMany({
      where: { ...scopedWhere(user, 'contact', 'read'), mergedIntoId: null },
      select: {
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        address: true,
        tags: true,
        source: true,
        notes: true,
        phones: { select: { phone: true, isPrimary: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'firstName',
      'lastName',
      'company',
      'phones',
      'email',
      'address',
      'tags',
      'source',
      'notes',
    ];
    const rows = contacts.map((contact) =>
      [
        contact.firstName,
        contact.lastName ?? '',
        contact.company ?? '',
        contact.phones
          .slice()
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .map((phone) => phone.phone)
          .join(' '),
        contact.email ?? '',
        contact.address ?? '',
        contact.tags.join(' '),
        contact.source ?? '',
        contact.notes ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );

    // Excel UTF-8 ni BOM orqali taniydi, aks holda kirill va o'zbek harflari buziladi.
    return `\uFEFF${[header.join(','), ...rows].join('\r\n')}\r\n`;
  }

  async importCsv(user: AuthUser, input: ImportInput) {
    const rows = parseCsv(input.csv);
    if (rows.length < 2) throw new BadRequestException("CSV bo'sh yoki faqat sarlavhadan iborat");

    const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
    const index = (...names: string[]) => {
      for (const name of names) {
        const at = header.indexOf(name);
        if (at >= 0) return at;
      }
      return -1;
    };

    const columns = {
      firstName: index('firstname', 'ism', 'name'),
      lastName: index('lastname', 'familiya'),
      company: index('company', 'kompaniya'),
      phones: index('phones', 'phone', 'telefon', 'raqam'),
      email: index('email', 'pochta'),
      address: index('address', 'manzil'),
      tags: index('tags', 'teglar'),
      source: index('source', 'manba'),
      notes: index('notes', 'izoh'),
    };

    if (columns.firstName < 0 && columns.phones < 0) {
      throw new BadRequestException(
        "CSV da kamida `firstName` yoki `phones` ustuni bo'lishi kerak",
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i]!;
      if (row.every((cell) => cell.trim() === '')) continue;

      const cell = (at: number) => (at >= 0 ? (row[at] ?? '').trim() : '');
      const phones = this.normalizePhones(
        cell(columns.phones)
          .split(/[;,\s]+/)
          .filter(Boolean)
          .map((phone, position) => ({ phone, isPrimary: position === 0 })),
      );

      const firstName = cell(columns.firstName) || phones[0]?.phone || '';
      if (!firstName) {
        errors.push({ row: i + 1, message: "Ism ham, raqam ham yo'q" });
        continue;
      }

      const existing = phones[0]
        ? await this.prisma.contact.findFirst({
            where: {
              tenantId: user.tenantId,
              mergedIntoId: null,
              phones: { some: { phoneKey: phones[0].phoneKey } },
            },
            select: { id: true },
          })
        : null;

      if (existing && input.onDuplicate === 'skip') {
        skipped += 1;
        continue;
      }

      const tags = cell(columns.tags)
        .split(/[;,\s]+/)
        .filter(Boolean);
      const data = {
        firstName,
        lastName: cell(columns.lastName) || undefined,
        company: cell(columns.company) || undefined,
        email: cell(columns.email) || undefined,
        address: cell(columns.address) || undefined,
        notes: cell(columns.notes) || undefined,
        tags,
        source: cell(columns.source) || 'csv-import',
      };

      try {
        if (existing) {
          await this.prisma.contact.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await this.prisma.contact.create({
            data: {
              tenantId: user.tenantId,
              ownerId: user.id,
              primaryPhoneKey: phones[0]?.phoneKey,
              ...data,
              phones: {
                create: phones.map((phone) => ({
                  tenantId: user.tenantId,
                  phone: phone.phone,
                  phoneKey: phone.phoneKey,
                  label: phone.label,
                  isPrimary: phone.isPrimary,
                })),
              },
            },
          });
          created += 1;
        }
      } catch (error) {
        errors.push({
          row: i + 1,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { created, updated, skipped, errors: errors.slice(0, 50), errorCount: errors.length };
  }

  private normalizePhones(
    input: Array<{ phone: string; label?: string; isPrimary?: boolean }> | undefined,
  ): Array<{ phone: string; phoneKey: string; label?: string; isPrimary: boolean }> {
    if (!input?.length) return [];

    const seen = new Set<string>();
    const result: Array<{ phone: string; phoneKey: string; label?: string; isPrimary: boolean }> =
      [];

    for (const item of input) {
      const normalized = normalizePhone(item.phone);
      if (!normalized) continue;
      const phoneKey = phoneSearchKey(normalized);
      if (seen.has(phoneKey)) continue;
      seen.add(phoneKey);
      result.push({
        phone: normalized,
        phoneKey,
        label: item.label,
        isPrimary: item.isPrimary ?? false,
      });
    }

    if (result.length > 0 && !result.some((phone) => phone.isPrimary)) {
      result[0]!.isPrimary = true;
    }
    return result;
  }
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Qo'shtirnoq ichidagi vergul va yangi qatorni to'g'ri o'qiydigan minimal CSV parser. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const source = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
