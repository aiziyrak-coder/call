import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveScope } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { scopedWhere } from '../common/tenant-scope';
import type { AuthUser } from '../auth/auth.types';
import type { z } from 'zod';
import type { dealMoveSchema, dealWriteSchema } from './crm.dto';

type DealWrite = z.infer<typeof dealWriteSchema>;
type DealMove = z.infer<typeof dealMoveSchema>;

const DEAL_SELECT = {
  id: true,
  title: true,
  amount: true,
  currency: true,
  position: true,
  stageId: true,
  pipelineId: true,
  closedAt: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      phones: { select: { phone: true, isPrimary: true } },
    },
  },
} satisfies Prisma.DealSelect;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async pipelines(user: AuthUser) {
    return this.prisma.pipeline.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        isDefault: true,
        stages: {
          select: { id: true, name: true, position: true, kind: true, color: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  /** Voronka ko'rinishi: har bir bosqich va undagi bitimlar tartib bo'yicha. */
  async board(user: AuthUser, pipelineId?: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: pipelineId
        ? { id: pipelineId, tenantId: user.tenantId }
        : { tenantId: user.tenantId, isDefault: true },
      select: {
        id: true,
        name: true,
        stages: {
          select: { id: true, name: true, position: true, kind: true, color: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pipeline) throw new NotFoundException('Voronka topilmadi');

    const deals = await this.prisma.deal.findMany({
      where: { ...scopedWhere(user, 'deal', 'read'), pipelineId: pipeline.id, closedAt: null },
      select: DEAL_SELECT,
      orderBy: [{ stageId: 'asc' }, { position: 'asc' }],
    });

    const byStage = new Map<string, typeof deals>();
    for (const deal of deals) {
      const bucket = byStage.get(deal.stageId) ?? [];
      bucket.push(deal);
      byStage.set(deal.stageId, bucket);
    }

    return {
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages: pipeline.stages.map((stage) => {
        const items = byStage.get(stage.id) ?? [];
        return {
          ...stage,
          deals: items,
          totalAmount: items.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0),
        };
      }),
    };
  }

  async create(user: AuthUser, input: DealWrite) {
    const { pipelineId, stageId } = await this.resolveTarget(user, input.pipelineId, input.stageId);

    // Yangi bitim ustunning boshiga tushadi — operator uni darhol ko'radi.
    const first = await this.prisma.deal.findFirst({
      where: { tenantId: user.tenantId, stageId },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          tenantId: user.tenantId,
          title: input.title,
          contactId: input.contactId ?? null,
          pipelineId,
          stageId,
          ownerId: input.ownerId ?? user.id,
          amount: input.amount !== undefined ? new Prisma.Decimal(input.amount) : null,
          currency: input.currency ?? 'UZS',
          position: (first?.position ?? 0) - 1,
        },
        select: DEAL_SELECT,
      });

      await tx.activity.create({
        data: {
          tenantId: user.tenantId,
          kind: 'SYSTEM',
          dealId: deal.id,
          contactId: input.contactId ?? null,
          actorId: user.id,
          title: `Bitim yaratildi: ${deal.title}`,
        },
      });

      return deal;
    });
  }

  async update(user: AuthUser, id: string, input: Partial<DealWrite>) {
    const existing = await this.prisma.deal.findFirst({
      where: { ...scopedWhere(user, 'deal', 'read'), id },
      select: { id: true, contactId: true, ownerId: true },
    });
    if (!existing) throw new NotFoundException('Bitim topilmadi');

    const canReassign = resolveScope(user.roles, 'deal', 'read') === 'all';
    if (input.ownerId !== undefined && input.ownerId !== existing.ownerId && !canReassign) {
      throw new ForbiddenException("Bitim egasini o'zgartirishga ruxsat yo'q");
    }

    return this.prisma.deal.update({
      where: { id },
      data: {
        title: input.title,
        contactId: input.contactId === undefined ? undefined : input.contactId,
        ownerId: canReassign
          ? input.ownerId === undefined
            ? undefined
            : input.ownerId
          : undefined,
        amount: input.amount !== undefined ? new Prisma.Decimal(input.amount) : undefined,
        currency: input.currency,
        lostReason: input.lostReason === undefined ? undefined : input.lostReason,
      },
      select: DEAL_SELECT,
    });
  }

  /**
   * Drag-and-drop: bitimni boshqa bosqichga va/yoki boshqa o'ringa ko'chiradi.
   * Ustundagi qolgan kartochkalar qayta raqamlanadi, shunda tartib barqaror bo'ladi.
   */
  async move(user: AuthUser, id: string, input: DealMove) {
    const deal = await this.prisma.deal.findFirst({
      where: { ...scopedWhere(user, 'deal', 'read'), id },
      select: { id: true, stageId: true, pipelineId: true, title: true, contactId: true },
    });
    if (!deal) throw new NotFoundException('Bitim topilmadi');

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: input.stageId, tenantId: user.tenantId, pipelineId: deal.pipelineId },
      select: { id: true, name: true, kind: true },
    });
    if (!stage) throw new BadRequestException('Bosqich shu voronkaga tegishli emas');

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.deal.findMany({
        where: { tenantId: user.tenantId, stageId: stage.id, closedAt: null, id: { not: id } },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      const ordered = [...siblings];
      ordered.splice(Math.min(input.position, ordered.length), 0, { id });

      for (const [position, item] of ordered.entries()) {
        await tx.deal.update({
          where: { id: item.id },
          data:
            item.id === id
              ? {
                  position,
                  stageId: stage.id,
                  // WON/LOST bosqichiga tushgan bitim yopilgan hisoblanadi.
                  closedAt: stage.kind === 'OPEN' ? null : new Date(),
                }
              : { position },
        });
      }

      if (deal.stageId !== stage.id) {
        await tx.activity.create({
          data: {
            tenantId: user.tenantId,
            kind: 'DEAL_STAGE_CHANGED',
            dealId: id,
            contactId: deal.contactId,
            actorId: user.id,
            title: `Bosqich o'zgardi: ${stage.name}`,
            metadata: { fromStageId: deal.stageId, toStageId: stage.id },
          },
        });
      }

      return tx.deal.findUniqueOrThrow({ where: { id }, select: DEAL_SELECT });
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.deal.findFirst({
      where: { ...scopedWhere(user, 'deal', 'read'), id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Bitim topilmadi');
    await this.prisma.deal.delete({ where: { id } });
  }

  private async resolveTarget(user: AuthUser, pipelineId?: string, stageId?: string) {
    if (pipelineId && stageId) {
      const stage = await this.prisma.pipelineStage.findFirst({
        where: { id: stageId, pipelineId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!stage) throw new BadRequestException('Bosqich shu voronkaga tegishli emas');
      return { pipelineId, stageId };
    }

    const pipeline = await this.prisma.pipeline.findFirst({
      where: pipelineId
        ? { id: pipelineId, tenantId: user.tenantId }
        : { tenantId: user.tenantId, isDefault: true },
      select: {
        id: true,
        stages: { orderBy: { position: 'asc' }, take: 1, select: { id: true } },
      },
    });
    const firstStage = pipeline?.stages[0];
    if (!pipeline || !firstStage) throw new BadRequestException('Voronka yoki bosqich topilmadi');

    return { pipelineId: pipeline.id, stageId: stageId ?? firstStage.id };
  }
}
