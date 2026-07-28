/**
 * AudioSocket — Asterisk ning eng sodda media protokoli:
 * `[1 bayt tur][2 bayt uzunlik BE][payload]`.
 * slin16 audio 16-bit signed LE, mono, 20 ms freymlar bilan keladi.
 */
export const AUDIOSOCKET_TYPE = {
  terminate: 0x00,
  uuid: 0x01,
  audio: 0x10,
  error: 0xff,
} as const;

export interface AudioSocketFrame {
  type: number;
  payload: Buffer;
}

/**
 * TCP oqimi freym chegaralarini saqlamaydi, shuning uchun to'liq bo'lmagan
 * bayt ketma-ketligi keyingi chaqiruvgacha buferda qoladi.
 */
export class AudioSocketParser {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer): AudioSocketFrame[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    const frames: AudioSocketFrame[] = [];
    while (this.buffer.length >= 3) {
      const length = this.buffer.readUInt16BE(1);
      const total = 3 + length;
      if (this.buffer.length < total) break;

      frames.push({
        type: this.buffer.readUInt8(0),
        payload: this.buffer.subarray(3, total),
      });
      this.buffer = this.buffer.subarray(total);
    }

    return frames;
  }
}

export function encodeFrame(type: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(3);
  header.writeUInt8(type, 0);
  header.writeUInt16BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/** UUID freymi 16 xom baytda keladi. */
export function decodeUuid(payload: Buffer): string {
  const hex = payload.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
