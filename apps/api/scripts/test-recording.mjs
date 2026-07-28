// Yozuvlar pipeline'ini uchidan-uchiga tekshirish: WAV yaratish -> Redis hodisa -> MinIO -> oqim.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6389');

function buildWav(seconds = 2, rate = 8000) {
  const samples = seconds * rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const tenant = await prisma.tenant.findFirstOrThrow();
const operator = await prisma.user.findFirstOrThrow({ where: { email: 'operator1@aicc.uz' } });

const callId = randomUUID();
await prisma.call.create({
  data: {
    id: callId,
    tenantId: tenant.id,
    channelId: `test-${callId}`,
    direction: 'INBOUND',
    state: 'ENDED',
    disposition: 'ANSWERED',
    fromNumber: '+998901112233',
    toNumber: '+998712000000',
    peerKey: '+998901112233',
    operatorId: operator.id,
    startedAt: new Date(Date.now() - 60_000),
    answeredAt: new Date(Date.now() - 55_000),
    endedAt: new Date(),
    durationSec: 60,
    talkTimeSec: 55,
  },
});
console.log('1) Sinov qo\'ng\'irog\'i yaratildi:', callId);

const fileName = `${callId}.wav`;
const spool = resolve(import.meta.dirname, '../../../infra/data/recordings');
await mkdir(spool, { recursive: true });
await writeFile(resolve(spool, fileName), buildWav());
console.log('2) Spool faylga WAV yozildi:', fileName);

await redis.xadd(
  'aicc:stream:telephony',
  '*',
  'payload',
  JSON.stringify({
    type: 'recording.ready',
    tenantId: tenant.id,
    callId,
    recordingId: randomUUID(),
    objectKey: fileName,
    durationSec: 2,
    sizeBytes: 0,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
  }),
);
console.log('3) recording.ready hodisasi Redis Streams ga yuborildi');

await new Promise((r) => setTimeout(r, 3000));

const recording = await prisma.recording.findUnique({ where: { callId } });
console.log('4) Baza yozuvi:', recording ? { key: recording.objectKey, size: recording.sizeBytes, retainUntil: recording.retainUntil } : 'YO\'Q');

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@aicc.uz', password: 'Aicc!2026' }),
}).then((r) => r.json());

const urlResponse = await fetch(`${API}/recordings/${callId}/url`, {
  headers: { authorization: `Bearer ${login.tokens.accessToken}` },
}).then((r) => r.json());
console.log('5) Tinglash havolasi:', urlResponse.url ? urlResponse.url.slice(0, 70) + '...' : JSON.stringify(urlResponse));
if (!urlResponse.url) process.exit(1);

const full = await fetch(urlResponse.url);
const bytes = Buffer.from(await full.arrayBuffer());
console.log('6) To\'liq oqim:', full.status, full.headers.get('content-type'), bytes.length, 'bayt', bytes.subarray(0, 4).toString());

const partial = await fetch(urlResponse.url, { headers: { range: 'bytes=0-99' } });
console.log('7) Range so\'rovi:', partial.status, partial.headers.get('content-range'), (await partial.arrayBuffer()).byteLength, 'bayt');

// Blok chegarasiga tushmaydigan siljish CTR hisoblagichi to'g'ri surilganini tekshiradi.
const odd = await fetch(urlResponse.url, { headers: { range: 'bytes=1001-2000' } });
const oddBytes = Buffer.from(await odd.arrayBuffer());
const matches = oddBytes.equals(bytes.subarray(1001, 2001));
console.log('8) Tekislanmagan Range (1001-2000):', odd.status, oddBytes.length, 'bayt, mos:', matches);

await prisma.$disconnect();
redis.disconnect();
