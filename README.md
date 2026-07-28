# AiCC — AI Call Center

Sun'iy intellektga asoslangan call-markaz platformasi. Media yo'li GSM-shlyuz (SIM -> SIP) orqali
Asterisk 22 ga, operator esa brauzerdagi WebRTC softfon bilan ishlaydi.

## Tuzilishi

| Yo'l                     | Vazifasi                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `apps/web`               | Next.js — operator, supervisor va admin interfeysi, SIP.js softfon |
| `apps/api`               | NestJS Core API — auth, RBAC, CRM, SMS, yozuvlar, Socket.IO        |
| `apps/telephony`         | ARI klienti, qo'ng'iroq holat mashinasi, AudioSocket media fork    |
| `apps/ai-worker`         | NestJS — AudioSocket serveri, STT ko'prigi, jonli transkripsiya    |
| `apps/companion-android` | Kotlin — SMS, click-to-call, qurilma health (MDM)                  |
| `packages/shared`        | Umumiy zod sxemalar, event kontraktlari, provider interfeyslari    |
| `infra`                  | docker-compose, Asterisk konfiguratsiyasi, STT image'lari          |

## Ishga tushirish

```bash
corepack enable
pnpm install
cp .env.example .env

pnpm infra:up          # postgres, redis, minio, asterisk
pnpm db:migrate        # Prisma migratsiyalari
pnpm db:seed           # boshlang'ich tenant, rollar, demo foydalanuvchilar
pnpm dev               # barcha servislar
```

Standart portlar: web `3000`, API `4000`, telephony `4100`, ai-worker `4200`,
Asterisk ARI `8088`, Asterisk WSS `8089`, MinIO API `9010`, MinIO konsoli `9011`.

### STT motorini yoqish

```bash
docker compose -f infra/docker-compose.yml --profile stt-whisper up -d   # ko'p tilli
docker compose -f infra/docker-compose.yml --profile stt-gigaam  up -d   # rus tili, aniqroq
```

## Jonli transkripsiya

Suhbat javob berilganda telephony servisi har bir tomon uchun snoop kanali ochib,
slin16 audioni AudioSocket orqali `ai-worker` ga uzatadi. Natijalar
`aicc:stream:ai` oqimiga tushadi, Core API ularni bazaga yozadi va operator
ekraniga Socket.IO bilan yuboradi.

```bash
# .env
AI_TRANSCRIPTION_ENABLED=true
STT_PROVIDER=openai          # zaxira: gigaam | whisper-live
OPENAI_API_KEY=sk-...
```

## Uchidan-uchiga sinovlar

Infratuzilma va API ishga tushirilgach:

```bash
cd apps/api
pnpm exec dotenv -e ../../.env -- node scripts/test-crm.mjs         # CRM
pnpm exec dotenv -e ../../.env -- node scripts/test-sms.mjs         # SMS + qurilma
pnpm exec dotenv -e ../../.env -- node scripts/test-admin.mjs       # admin + KPI
pnpm exec dotenv -e ../../.env -- node scripts/test-recording.mjs   # yozuvlar
pnpm exec dotenv -e ../../.env -- node scripts/test-ai-pipeline.mjs # transkripsiya
```

## Telefoniyani apparatsiz sinash

GSM-shlyuz kelguncha "PSTN tomoni" softfon bilan simulyatsiya qilinadi:
MicroSIP yoki Zoiper ni `pstn-sim` hisobi bilan Asterisk ga ulang
(`infra/asterisk/config/pjsip.conf` ga qarang), so'ng brauzerdagi operatorga qo'ng'iroq qiling.
