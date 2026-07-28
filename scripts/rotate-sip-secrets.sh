#!/usr/bin/env bash
# SIP parollarni rotate qiladi va pjsip_endpoints.conf ni hostga yozadi.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
OUT="$ROOT/infra/asterisk/config/pjsip_endpoints.conf"

echo "==> DB dagi SIP parollarni yangilash"
"${COMPOSE[@]}" exec -T api node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { createCipheriv, randomBytes } = require('crypto');
const key = Buffer.from(process.env.RECORDING_ENCRYPTION_KEY, 'hex');
const encrypt = (p) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(p, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
};
(async () => {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({
    where: { sipExtension: { not: null } },
    select: { id: true, sipExtension: true },
  });
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { sipPassword: encrypt(randomBytes(18).toString('base64url')) },
    });
    console.log('rotated', u.sipExtension);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

echo "==> pjsip_endpoints.conf generatsiya"
"${COMPOSE[@]}" exec -T api node <<'NODE' > "$OUT"
const { PrismaClient } = require('@prisma/client');
const { createDecipheriv } = require('crypto');
const PREFIX = 'enc:v1:';
function decrypt(value, keyHex) {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value;
  const key = Buffer.from(keyHex, 'hex');
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split('.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  d.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(dataB64, 'base64url')), d.final()]).toString('utf8');
}
(async () => {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({
    where: { isActive: true, sipExtension: { not: null }, sipPassword: { not: null } },
    orderBy: { sipExtension: 'asc' },
    select: { sipExtension: true, sipPassword: true, fullName: true, id: true },
  });
  const keyHex = process.env.RECORDING_ENCRYPTION_KEY;
  let out = '; AUTO-GENERATED — do not commit secrets\n';
  for (const u of users) {
    const ext = u.sipExtension;
    const password = decrypt(u.sipPassword, keyHex);
    const name = u.fullName.replace(/[;<>"]/g, '').trim();
    out += `\n[${ext}](webrtc-endpoint)\nauth = ${ext}\naors = ${ext}\ncallerid = ${name} <${ext}>\nset_var = AICC_USER_ID=${u.id}\n\n[${ext}](webrtc-auth)\nusername = ${ext}\npassword = ${password}\n\n[${ext}](webrtc-aor)\n`;
  }
  process.stdout.write(out);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

chmod 600 "$OUT"
echo "==> Asterisk PJSIP reload"
docker exec aicc-call-asterisk asterisk -rx 'module reload res_pjsip.so' || true
echo "OK $OUT"
