import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { skipTake, toPage, type Page } from '../common/pagination';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type {
  auditListSchema,
  queueWriteSchema,
  userCreateSchema,
  userListSchema,
  userUpdateSchema,
} from './admin.dto';

type UserList = z.infer<typeof userListSchema>;
type UserCreate = z.infer<typeof userCreateSchema>;
type UserUpdate = z.infer<typeof userUpdateSchema>;
type QueueWrite = z.infer<typeof queueWriteSchema>;
type AuditList = z.infer<typeof auditListSchema>;

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  roles: true,
  isActive: true,
  status: true,
  statusChangedAt: true,
  sipExtension: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  // -------------------------------------------------------- foydalanuvchilar

  async listUsers(user: AuthUser, query: UserList): Promise<Page<unknown>> {
    const where: Prisma.UserWhereInput = { tenantId: user.tenantId };
    if (query.role) where.roles = { has: query.role };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { sipExtension: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  async createUser(admin: AuthUser, input: UserCreate) {
    const email = input.email.toLowerCase().trim();

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: admin.tenantId, email },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Bu email allaqachon band');

    await this.assertExtensionFree(admin.tenantId, input.sipExtension);

    return this.prisma.user.create({
      data: {
        tenantId: admin.tenantId,
        email,
        fullName: input.fullName,
        phone: input.phone,
        roles: input.roles as Role[],
        passwordHash: await this.auth.hashPassword(input.password),
        sipExtension: input.sipExtension ?? null,
        // SIP paroli hech qachon foydalanuvchi tanlagan parol bilan bir xil bo'lmaydi.
        sipPassword: input.sipExtension ? randomBytes(18).toString('base64url') : null,
      },
      select: USER_SELECT,
    });
  }

  async updateUser(admin: AuthUser, id: string, input: UserUpdate) {
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId: admin.tenantId },
      select: { id: true, roles: true, sipExtension: true, sipPassword: true },
    });
    if (!existing) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (id === admin.id && input.isActive === false) {
      throw new BadRequestException("O'z hisobingizni o'chira olmaysiz");
    }
    if (id === admin.id && input.roles && !input.roles.includes('ADMIN')) {
      throw new BadRequestException("O'zingizdan admin huquqini olib tashlay olmaysiz");
    }

    const extension = input.sipExtension === '' ? null : input.sipExtension;
    if (extension && extension !== existing.sipExtension) {
      await this.assertExtensionFree(admin.tenantId, extension);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        phone: input.phone === undefined ? undefined : input.phone,
        roles: input.roles as Role[] | undefined,
        isActive: input.isActive,
        ...(input.sipExtension === undefined
          ? {}
          : {
              sipExtension: extension,
              sipPassword: extension
                ? (existing.sipPassword ?? randomBytes(18).toString('base64url'))
                : null,
            }),
        ...(input.password ? { passwordHash: await this.auth.hashPassword(input.password) } : {}),
      },
      select: USER_SELECT,
    });
  }

  /** Barcha refresh tokenlarni bekor qiladi — o'g'irlangan sessiyani uzish uchun. */
  async revokeSessions(admin: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: admin.tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const result = await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  private async assertExtensionFree(tenantId: string, extension?: string | null): Promise<void> {
    if (!extension) return;
    const taken = await this.prisma.user.findFirst({
      where: { tenantId, sipExtension: extension },
      select: { id: true },
    });
    if (taken) throw new BadRequestException(`${extension} raqami band`);
  }

  // ---------------------------------------------------------------- navbatlar

  async listQueues(user: AuthUser) {
    return this.prisma.queue.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { extension: 'asc' },
    });
  }

  async createQueue(user: AuthUser, input: QueueWrite) {
    const taken = await this.prisma.queue.findFirst({
      where: { tenantId: user.tenantId, extension: input.extension },
      select: { id: true },
    });
    if (taken) throw new BadRequestException(`${input.extension} raqami band`);

    return this.prisma.queue.create({ data: { tenantId: user.tenantId, ...input } });
  }

  async updateQueue(user: AuthUser, id: string, input: Partial<QueueWrite>) {
    const existing = await this.prisma.queue.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Navbat topilmadi');

    return this.prisma.queue.update({ where: { id }, data: input });
  }

  async removeQueue(user: AuthUser, id: string): Promise<void> {
    const result = await this.prisma.queue.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (result.count === 0) throw new NotFoundException('Navbat topilmadi');
  }

  // -------------------------------------------------------------- audit-jurnal

  async listAudit(user: AuthUser, query: AuditList): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = { tenantId: user.tenantId };
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = { contains: query.action };
    if (query.resource) where.resource = query.resource;
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          changes: true,
          ipAddress: true,
          success: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
        ...skipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPage(items, total, query);
  }
}
