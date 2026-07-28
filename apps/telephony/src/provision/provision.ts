import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Bazadagi foydalanuvchilardan `pjsip_endpoints.conf` ni qayta generatsiya qiladi.
 * Admin panelda operator qo'shilgach shu skript ishga tushiriladi va Asterisk ga
 * `module reload res_pjsip.so` yuboriladi.
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
  // Asterisk konfiguratsiyasida `;` izoh boshlanishi, `<>` esa CallerID sintaksisi.
  return name.replace(/[;<>"]/g, '').trim();
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, sipExtension: { not: null }, sipPassword: { not: null } },
      orderBy: { sipExtension: 'asc' },
      select: { sipExtension: true, sipPassword: true, fullName: true, id: true },
    });

    const blocks = users.map((user) => {
      const ext = user.sipExtension!;
      return [
        `[${ext}](webrtc-endpoint)`,
        `auth = ${ext}`,
        `aors = ${ext}`,
        `callerid = ${escapeCallerId(user.fullName)} <${ext}>`,
        `set_var = AICC_USER_ID=${user.id}`,
        '',
        `[${ext}](webrtc-auth)`,
        `username = ${ext}`,
        `password = ${user.sipPassword}`,
        '',
        `[${ext}](webrtc-aor)`,
        '',
      ].join('\n');
    });

    const content =
      HEADER.replace('{timestamp}', new Date().toISOString()) + '\n' + blocks.join('\n');

    // Asterisk konfiguratsiyasi har doim LF bilan yozilishi kerak.
    writeFileSync(OUTPUT_PATH, content.replace(/\r\n/g, '\n'), 'utf8');

    console.log(`${users.length} ta operator endpointi yozildi: ${OUTPUT_PATH}`);
    console.log(
      'Qo\'llash uchun: docker exec aicc-asterisk asterisk -rx "module reload res_pjsip.so"',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: Error) => {
  console.error(`Provision xatosi: ${error.message}`);
  process.exit(1);
});
