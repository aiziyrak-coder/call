import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveScope } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { scopedWhere } from '../common/tenant-scope';
import { skipTake, toPage, Page } from '../common/pagination';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type { taskListSchema, taskWriteSchema } from './crm.dto';

type TaskWrite = z.infer<typeof taskWriteSchema>;
type TaskList = z.infer<typeof taskListSchema>;

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  assignee: { select: { id: true, fullName: true } },
  contact: { select: { id: true, firstName: true, lastName: true, company: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.TaskSelect;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: TaskList): Promise<Page<unknown>> {
    const where: Prisma.TaskWhereInput = scopedWhere(user, 'task', 'read', 'assigneeId');
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.dueBefore) where.dueAt = { lte: query.dueBefore };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: TASK_SELECT,
        // Muddati yaqinlari birinchi; muddatsizlari oxirida.
        orderBy: [
          { status: 'asc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { priority: 'desc' },
        ],
        ...skipTake(query),
      }),
      this.prisma.task.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  async create(user: AuthUser, input: TaskWrite) {
    return this.prisma.task.create({
      data: {
        tenantId: user.tenantId,
        title: input.title,
        description: input.description,
        status: input.status ?? 'OPEN',
        priority: input.priority ?? 'NORMAL',
        dueAt: input.dueAt ?? null,
        assigneeId: input.assigneeId ?? user.id,
        creatorId: user.id,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
      },
      select: TASK_SELECT,
    });
  }

  async update(user: AuthUser, id: string, input: Partial<TaskWrite>) {
    const existing = await this.prisma.task.findFirst({
      where: { ...scopedWhere(user, 'task', 'read', 'assigneeId'), id },
      select: { id: true, status: true, assigneeId: true },
    });
    if (!existing) throw new NotFoundException('Vazifa topilmadi');

    const canReassign = resolveScope(user.roles, 'task', 'read') === 'all';
    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId && !canReassign) {
      throw new ForbiddenException("Ijrochini o'zgartirishga ruxsat yo'q");
    }

    const becameDone = input.status === 'DONE' && existing.status !== 'DONE';

    return this.prisma.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt,
        assigneeId: canReassign
          ? input.assigneeId === undefined
            ? undefined
            : input.assigneeId
          : undefined,
        contactId: input.contactId === undefined ? undefined : input.contactId,
        dealId: input.dealId === undefined ? undefined : input.dealId,
        completedAt: becameDone ? new Date() : input.status ? null : undefined,
      },
      select: TASK_SELECT,
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: { ...scopedWhere(user, 'task', 'read', 'assigneeId'), id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Vazifa topilmadi');
    await this.prisma.task.delete({ where: { id } });
  }
}