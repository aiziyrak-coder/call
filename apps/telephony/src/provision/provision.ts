import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decryptField } from '../common/crypto';

/**
 * Bazadagi foydalanuvchilardan `pjsip_endpoints.conf` ni qayta generatsiya qiladi.
 */
const OUTPUT_PATH = resolve(
  process.cwd(),
  process.env.PJSIP_ENDPOINTS_PATH ?? '../../infra/asterisk/config/pjsip_endpoints.conf',
);

const HEADER = `;==============================================================================
; Operator endpointlari — BU FAYL AVTOMATIK GENERATSIYA QILINADI.
; Qo'lda tahrirlamang: \`pnpm --filter @aicc/telephony run provision\` buyrug'i
; uni bazadagi foydalanuvchilardan qayta yozadi.
;
; Oxirgi generatsiya: {timestamp}
;==============================================================================
`;

function escapeCallerId(name: string): string {
  return name.replace(/[;<>"]/g, '').trim();
}

async function main(): Promise<void> {
  const keyHex = process.env.RECORDING_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('RECORDING_ENCRYPTION_KEY (64 hex) kerak');
  }

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, sipExtension: { not: null }, sipPassword: { not: null } },
      orderBy: { sipExtension: 'asc' },
      select: { sipExtension: true, sipPassword: true, fullName: true, id: true },
    });

    const blocks = users.map((user) => {
      const ext = user.sipExtension!;
      const password = decryptField(user.sipPassword, keyHex) ?? '';
      return [
        `[${ext}](webrtc-endpoint)`,
        `auth = ${ext}`,
        `aors = ${ext}`,
        `callerid = ${escapeCallerId(user.fullName)} <${ext}>`,
        `set_var = AICC_USER_ID=${user.id}`,
        '',
        `[${ext}](webrtc-auth)`,
        `username = ${ext}`,
        `password = ${password}`,
        '',
        `[${ext}](webrtc-aor)`,
        '',
      ].join('\n');
    });

    const content =
      HEADER.replace('{timestamp}', new Date().toISOString()) + '\n' + blocks.join('\n');

    writeFileSync(OUTPUT_PATH, content.replace(/\r\n/g, '\n'), { encoding: 'utf8', mode: 0o600 });

    console.log(`${users.length} ta operator endpointi yozildi: ${OUTPUT_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: Error) => {
  console.error(`Provision xatosi: ${error.message}`);
  process.exit(1);
});
