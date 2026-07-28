import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission, type AiccEvent } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

type TranscriptFinal = Extract<AiccEvent, { type: 'transcript.final' }>;

@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Yakuniy segmentni saqlaydi. Qisman (partial) natijalar bazaga yozilmaydi —
   * ular faqat operator ekranida ko'rsatiladi va tez o'zgaradi.
   */
  async appendSegment(event: TranscriptFinal): Promise<void> {
    const call = await this.prisma.call.findFirst({
      where: { id: event.callId, tenantId: event.tenantId },
      select: { id: true },
    });
    if (!call) {
      this.logger.debug(`Transkript uchun qo'ng'iroq topilmadi: ${event.callId}`);
      return;
    }

    const transcript = await this.prisma.transcript.upsert({
      where: { callId: event.callId },
      update: {},
      create: { tenantId: event.tenantId, callId: event.callId },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.transcriptSegment.create({
        data: {
          transcriptId: transcript.id,
          speaker: event.speaker,
          text: event.text,
          startMs: event.startMs,
          endMs: event.endMs,
          confidence: event.confidence,
        },
      }),
      // `fullText` qidiruv uchun — segmentlar tartibida o'sib boradi.
      this.prisma.$executeRaw`
        UPDATE "transcripts"
        SET "fullText" = CASE WHEN "fullText" = '' THEN ${event.text}
                              ELSE "fullText" || ' ' || ${event.text} END,
            "updatedAt" = NOW()
        WHERE "id" = ${transcript.id}
      `,
    ]);
  }

  async getByCall(user: AuthUser, callId: string) {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, tenantId: user.tenantId },
      select: { id: true, operatorId: true },
    });
    if (!call) return null;

    // Operator faqat o'z suhbatlari transkriptini ko'radi.
    if (call.operatorId !== user.id && !hasPermission(user.roles, 'call:read:all')) {
      throw new ForbiddenException('Bu suhbat sizga tegishli emas');
    }

    return this.prisma.transcript.findUnique({
      where: { callId },
      select: {
        id: true,
        language: true,
        engine: true,
        fullText: true,
        summary: true,
        segments: {
          orderBy: { startMs: 'asc' },
          select: {
            id: true,
            speaker: true,
            text: true,
            startMs: true,
            endMs: true,
            confidence: true,
          },
        },
      },
    });
  }

  /** Suhbatlar bo'yicha to'liq matnli qidiruv (2-bosqich uchun asos). */
  async search(user: AuthUser, query: string, limit = 20) {
    const where: Prisma.TranscriptWhereInput = {
      tenantId: user.tenantId,
      fullText: { contains: query, mode: 'insensitive' },
      ...(hasPermission(user.roles, 'call:read:all') ? {} : { call: { operatorId: user.id } }),
    };

    return this.prisma.transcript.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        callId: true,
        fullText: true,
        summary: true,
        call: {
          select: { startedAt: true, fromNumber: true, toNumber: true, direction: true },
        },
      },
    });
  }
}
