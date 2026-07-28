import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const IV_LENGTH = 16;
const AES_BLOCK = 16;

/**
 * MinIO/S3 ustidagi qatlam. Yozuvlar obyekt xotirasiga tushishidan oldin
 * AES-256-CTR bilan shifrlanadi (envelope: [16 bayt IV][shifrmatn]) — kalit
 * faqat API da qoladi, shu sababli xotiraga ruxsat olgan tomon audioni ocholmaydi.
 *
 * CTR rejimi ataylab tanlangan: pleyerdagi "oldinga o'tish" uchun HTTP Range
 * so'rovlari kerak, CTR esa hisoblagichni siljitib istalgan joydan deshifrlash
 * imkonini beradi (GCM/CBC da bu mumkin emas).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  readonly bucket: string;

  private readonly encryptionKey: Buffer;
  // Har bir Range so'rovida IV uchun qo'shimcha so'rov qilmaslik uchun.
  private readonly ivCache = new Map<string, Buffer>();

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true),
    });

    this.encryptionKey = Buffer.from(config.getOrThrow<string>('RECORDING_ENCRYPTION_KEY'), 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error("RECORDING_ENCRYPTION_KEY aynan 32 bayt (64 hex belgi) bo'lishi kerak");
    }
  }

  /** Kalit rotatsiyasini kuzatish uchun kalit identifikatori (kalitning o'zi emas). */
  get keyId(): string {
    return createHash('sha256').update(this.encryptionKey).digest('hex').slice(0, 16);
  }

  async put(objectKey: string, body: Buffer, contentType = 'audio/wav'): Promise<void> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-ctr', this.encryptionKey, iv);
    const payload = Buffer.concat([iv, cipher.update(body), cipher.final()]);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: payload,
        ContentType: contentType,
        Metadata: { 'aicc-enc': 'aes-256-ctr', 'aicc-key-id': this.keyId },
      }),
    );
    this.ivCache.set(objectKey, iv);
  }

  /**
   * Deshifrlangan oqim qaytaradi. `range` — mijoz so'ragan **ochiq matn**
   * baytlari; shifrmatndagi siljish IV uzunligiga surib hisoblanadi.
   */
  async get(
    objectKey: string,
    range?: string,
  ): Promise<{ stream: Readable; contentLength: number; contentRange?: string }> {
    const totalSize = Math.max(0, (await this.size(objectKey)) - IV_LENGTH);
    const iv = await this.readIv(objectKey);

    const parsed = this.parseRange(range, totalSize);
    const start = parsed?.start ?? 0;
    const end = parsed?.end ?? Math.max(0, totalSize - 1);
    const length = totalSize === 0 ? 0 : end - start + 1;

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Range: `bytes=${IV_LENGTH + start}-${IV_LENGTH + end}`,
      }),
    );

    const decipher = createDecipheriv('aes-256-ctr', this.encryptionKey, this.counterAt(iv, start));

    const output = new PassThrough();
    const source = response.Body as Readable;
    // CTR bloki 16 bayt: so'ralgan siljish blok chegarasiga tushmasa,
    // hisoblagichni tekislash uchun oldiga to'ldirgich qo'yiladi va
    // deshifrlangandan keyin o'sha baytlar tashlab yuboriladi.
    const skip = start % AES_BLOCK;
    const padded = Readable.from(
      (async function* () {
        if (skip > 0) yield Buffer.alloc(skip);
        for await (const chunk of source) yield chunk as Buffer;
      })(),
    );

    void pipeline(padded, decipher, this.dropPrefix(skip), output).catch((error: Error) => {
      this.logger.error(`Yozuv oqimida xato (${objectKey}): ${error.message}`);
      output.destroy(error);
    });

    return {
      stream: output,
      contentLength: length,
      contentRange: parsed ? `bytes ${start}-${end}/${totalSize}` : undefined,
    };
  }

  /** Shifrlangan obyektning to'liq o'lchami (IV bilan birga). */
  async size(objectKey: string): Promise<number> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return response.ContentLength ?? 0;
  }

  async remove(objectKey: string): Promise<void> {
    this.ivCache.delete(objectKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: '__healthcheck__' }),
      );
      return { healthy: true };
    } catch (error) {
      // 404 — bucket ishlayapti, shunchaki obyekt yo'q.
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotFound' || name === 'NoSuchKey') return { healthy: true };
      return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async readIv(objectKey: string): Promise<Buffer> {
    const cached = this.ivCache.get(objectKey);
    if (cached) return cached;

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Range: `bytes=0-${IV_LENGTH - 1}`,
      }),
    );
    const iv = Buffer.from(
      await (
        response.Body as Readable & { transformToByteArray(): Promise<Uint8Array> }
      ).transformToByteArray(),
    );
    this.ivCache.set(objectKey, iv);
    return iv;
  }

  /** IV ni `offset` ga mos blok soniga siljitadi (CTR hisoblagichi big-endian). */
  private counterAt(iv: Buffer, offset: number): Buffer {
    const blocks = BigInt(Math.floor(offset / AES_BLOCK));
    if (blocks === 0n) return Buffer.from(iv);

    const counter = Buffer.from(iv);
    let carry = blocks;
    for (let i = counter.length - 1; i >= 0 && carry > 0n; i -= 1) {
      const sum = BigInt(counter[i]) + (carry & 0xffn);
      counter[i] = Number(sum & 0xffn);
      carry = (carry >> 8n) + (sum >> 8n);
    }
    return counter;
  }

  private dropPrefix(count: number): Transform {
    let remaining = count;
    return new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (remaining <= 0) {
          done(null, chunk);
          return;
        }
        if (chunk.length <= remaining) {
          remaining -= chunk.length;
          done();
          return;
        }
        const rest = chunk.subarray(remaining);
        remaining = 0;
        done(null, rest);
      },
    });
  }

  private parseRange(
    range: string | undefined,
    totalSize: number,
  ): { start: number; end: number } | null {
    if (!range || totalSize === 0) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') return null;

    // "bytes=-N" — oxirgi N bayt.
    if (rawStart === '') {
      const suffix = Math.min(Number(rawEnd), totalSize);
      return { start: totalSize - suffix, end: totalSize - 1 };
    }

    const start = Math.min(Number(rawStart), totalSize - 1);
    const end = rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
    if (end < start) return null;
    return { start, end };
  }
}
