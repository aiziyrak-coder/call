// AI oqimi: soxta STT serveri + AudioSocket mijozi -> Redis -> Core API -> baza.
import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
// `ws` faqat ai-worker ning bog'liqligi, shuning uchun to'g'ridan-to'g'ri yo'l orqali.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WebSocketServer } = require('../../ai-worker/node_modules/ws');
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const AUDIOSOCKET_PORT = Number(process.env.AUDIOSOCKET_PORT ?? 8090);
const STT_PORT = 9876;

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const prisma = new PrismaClient();

// 1) Soxta GigaAM serveri: audio kelganda oldindan tayyorlangan matnni qaytaradi.
const PHRASES = [
  { text: 'Здравствуйте, слушаю вас', final: false },
  { text: 'Здравствуйте, слушаю вас внимательно', final: true },
  { text: 'Хочу уточнить по тарифу', final: true },
];

const wss = new WebSocketServer({ port: STT_PORT });
let sttSessions = 0;

wss.on('connection', (socket) => {
  sttSessions += 1;
  let configured = false;
  let index = 0;

  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      configured = true;
      return;
    }
    if (!configured || index >= PHRASES.length) return;

    const phrase = PHRASES[index];
    index += 1;
    socket.send(
      JSON.stringify({
        text: phrase.text,
        is_final: phrase.final,
        start_ms: index * 1000,
        end_ms: index * 1000 + 900,
        confidence: 0.93,
      }),
    );
  });
});
console.log(`1) Soxta STT serveri ishga tushdi: ws://localhost:${STT_PORT}`);

// 2) Sinov qo'ng'irog'i - transkript segmentlari shunga bog'lanadi.
const tenant = await prisma.tenant.findFirstOrThrow({ where: { isActive: true } });
const operator = await prisma.user.findFirstOrThrow({
  where: { tenantId: tenant.id, email: 'operator1@aicc.uz' },
});

const callId = randomUUID();
await prisma.call.create({
  data: {
    id: callId,
    tenantId: tenant.id,
    channelId: `test-ai-${Date.now()}`,
    direction: 'INBOUND',
    state: 'ANSWERED',
    fromNumber: '+998901234567',
    toNumber: '+998712000000',
    peerKey: '998901234567',
    operatorId: operator.id,
    answeredAt: new Date(),
  },
});
console.log('2) Sinov qo\'ng\'irog\'i yaratildi:', callId);

// 3) Telephony yozadigan fork bog'lanishini simulyatsiya qilamiz.
const forkId = randomUUID();
await redis.set(
  `aicc:fork:${forkId}`,
  JSON.stringify({
    callId,
    tenantId: tenant.id,
    speaker: 'CUSTOMER',
    language: 'ru',
    sampleRate: 16000,
  }),
  'EX',
  600,
);
console.log('3) Media fork bog\'lanishi Redis ga yozildi:', forkId);

// 4) Asterisk o'rniga AudioSocket mijozi: UUID freymi, keyin slin16 audio.
const socket = connect(AUDIOSOCKET_PORT, '127.0.0.1');
await new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('error', reject);
});

const frame = (type, payload = Buffer.alloc(0)) => {
  const header = Buffer.alloc(3);
  header.writeUInt8(type, 0);
  header.writeUInt16BE(payload.length, 1);
  return Buffer.concat([header, payload]);
};

socket.write(frame(0x01, Buffer.from(forkId.replace(/-/g, ''), 'hex')));
await new Promise((r) => setTimeout(r, 500));
console.log('4) AudioSocket ulanishi ochildi, STT sessiyalari:', sttSessions);

// 20 ms slin16 freym = 640 bayt (16 kHz, mono, 16-bit).
for (let i = 0; i < PHRASES.length; i += 1) {
  socket.write(frame(0x10, Buffer.alloc(640)));
  await new Promise((r) => setTimeout(r, 300));
}
console.log('5) Audio freymlar yuborildi:', PHRASES.length);

await new Promise((r) => setTimeout(r, 1500));

// 5) Core API `transcript.final` larni bazaga yozgan bo'lishi kerak.
const transcript = await prisma.transcript.findUnique({
  where: { callId },
  include: { segments: { orderBy: { startMs: 'asc' } } },
});

if (!transcript) {
  console.log('6) XATO: transkript yaratilmadi');
} else {
  console.log('6) Transkript segmentlari:', transcript.segments.length);
  transcript.segments.forEach((segment) =>
    console.log(`   [${segment.speaker}] ${segment.text}`),
  );
  console.log('7) fullText:', transcript.fullText);
}

// 6) API orqali o'qish (RBAC bilan).
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'operator1@aicc.uz', password: 'Aicc!2026' }),
}).then((r) => r.json());

const viaApi = await fetch(`${API}/transcripts/${callId}`, {
  headers: { authorization: `Bearer ${login.tokens.accessToken}` },
});
const body = viaApi.ok ? await viaApi.json() : null;
console.log('8) API orqali:', viaApi.status, body ? `${body.segments.length} segment` : '');

const search = await fetch(`${API}/transcripts/search?q=тарифу`, {
  headers: { authorization: `Bearer ${login.tokens.accessToken}` },
}).then((r) => r.json());
console.log('9) Qidiruv "тарифу":', search.length, 'ta natija');

socket.write(frame(0x00));
socket.end();
wss.close();
await prisma.call.delete({ where: { id: callId } });
await redis.del(`aicc:fork:${forkId}`);
await redis.quit();
await prisma.$disconnect();
console.log('10) Tozalandi');
