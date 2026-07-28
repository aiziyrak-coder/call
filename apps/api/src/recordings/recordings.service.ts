import { readFile, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveScope } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { safeBasename } from '../common/field-crypto.service';
import type { AuthUser } from '../auth/auth.types';

const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RecordingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordingsService.name);
  private readonly spoolDir: string;
  private readonly retentionDays: number;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    // Asterisk yozuvni shu katalogga tashlaydi; u bind mount orqali hostga ulangan.
    this.spoolDir = resolve(
      process.cwd(),
      config.get<string>('RECORDING_SPOOL_DIR', '../../infra/data/recordings'),
    );
    this.retentionDays = config.get<number>('RECORDING_RETENTION_DAYS', 365);
  }

  onModuleInit(): void {
    // Muddati o'tgan yozuvlarni davriy tozalash (qonunchilik talabi).
    this.sweepTimer = setInterval(() => {
      void this.purgeExpired().catch((error: Error) =>
        this.logger.error(`Tozalashda xato: ${error.message}`),
      );
    }, RETENTION_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Asterisk yozib bo'lgach chaqiriladi: faylni shifrlab MinIO ga yuklaydi,
   * bazaga yozuv qo'shadi va lokal nusxani o'chiradi.
   */
  async ingest(params: {
    tenantId: string;
    callId: string;
    fileName: string;
    durationSec: number;
  }): Promise<void> {
    const existing = await this.prisma.recording.findUnique({ where: { callId: params.callId } });
    if (existing) {
      this.logger.debug(`Yozuv allaqachon yuklangan: ${params.callId}`);
      return;
    }

    const call = await this.prisma.call.findUnique({
      where: { id: params.callId },
      select: { id: true, tenantId: true },
    });
    if (!call) {
      this.logger.warn(`Yozuv uchun qo'ng'iroq topilmadi: ${params.callId}`);
      return;
    }

    const safeName = safeBasename(params.fileName);
    const localPath = resolve(this.spoolDir, safeName);
    if (!localPath.startsWith(resolve(this.spoolDir))) {
      this.logger.warn(`Path traversal urinishi: ${params.fileName}`);
      return;
    }
    let body: Buffer;
    try {
      body = await readFile(localPath);
    } catch (error) {
      this.logger.error(
        `Yozuv faylini o'qib bo'lmadi (${localPath}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const stats = await stat(localPath).catch(() => null);
    // Sana bo'yicha bo'lish katalogni kichik saqlaydi va arxivlashni osonlashtiradi.
    const date = new Date();
    const objectKey = [
      call.tenantId,
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
      safeName,
    ].join('/');

    await this.storage.put(objectKey, body);

    const retainUntil = new Date();
    retainUntil.setDate(retainUntil.getDate() + this.retentionDays);

    await this.prisma.recording.create({
      data: {
        tenantId: call.tenantId,
        callId: call.id,
        objectKey,
        bucket: this.storage.bucket,
        sizeBytes: stats?.size ?? body.byteLength,
        durationSec: params.durationSec,
        format: safeName.split('.').pop() ?? 'wav',
        encryptionKeyId: this.storage.keyId,
        retainUntil,
      },
    });

    // Diskda shifrlanmagan nusxa qolmasligi kerak.
    await unlink(localPath).catch((error: Error) =>
      this.logger.warn(`Lokal faylni o'chirib bo'lmadi: ${error.message}`),
    );

    this.logger.log(`Yozuv yuklandi: ${objectKey} (${body.byteLength} bayt)`);
  }

  /**
   * Same-origin cookie-auth URL — token query stringda emas.
   */
  async playbackUrl(
    user: AuthUser,
    callId: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    await this.requireAccessible(user, callId);
    const base = this.config.get<string>('PUBLIC_API_URL', 'http://localhost:4000');
    return {
      url: `${base}/api/v1/recordings/${callId}/stream`,
      expiresInSec: 0,
    };
  }

  async openStreamForUser(
    user: AuthUser,
    callId: string,
    range?: string,
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentRange?: string;
    contentType: string;
  }> {
    const recording = await this.requireAccessible(user, callId);
    const object = await this.storage.get(recording.objectKey, range);
    return {
      ...object,
      contentType: recording.format === 'wav' ? 'audio/wav' : `audio/${recording.format}`,
    };
  }

  async remove(user: AuthUser, callId: string): Promise<void> {
    const recording = await this.requireAccessible(user, callId);
    await this.storage
      .remove(recording.objectKey)
      .catch((error: Error) => this.logger.warn(`Obyektni o'chirib bo'lmadi: ${error.message}`));
    await this.prisma.recording.update({
      where: { id: recording.id },
      data: { deletedAt: new Date() },
    });
  }

  /** Saqlash muddati tugagan yozuvlarni o'chiradi. */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.recording.findMany({
      where: { retainUntil: { lte: new Date() }, deletedAt: null },
      select: { id: true, objectKey: true },
      take: 500,
    });

    for (const recording of expired) {
      await this.storage
        .remove(recording.objectKey)
        .catch((error: Error) =>
          this.logger.warn(`Obyektni o'chirib bo'lmadi (${recording.objectKey}): ${error.message}`),
        );
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: { deletedAt: new Date() },
      });
    }

    if (expired.length > 0) {
      this.logger.log(`Saqlash muddati tugagan ${expired.length} ta yozuv o'chirildi`);
    }
    return expired.length;
  }

  private async requireAccessible(user: AuthUser, callId: string) {
    const recording = await this.prisma.recording.findFirst({
      where: { callId, tenantId: user.tenantId, deletedAt: null },
      include: { call: { select: { operatorId: true } } },
    });
    if (!recording) throw new NotFoundException('Yozuv topilmadi');

    const scope = resolveScope(user.roles, 'recording', 'read');
    if (scope === 'none') throw new ForbiddenException("Yozuvlarni tinglash huquqi yo'q");
    if (scope === 'own' && recording.call.operatorId !== user.id) {
      throw new ForbiddenException('Bu yozuv sizga tegishli emas');
    }
    return recording;
  }
}
