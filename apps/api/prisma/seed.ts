import { hash } from '@node-rs/argon2';
import { PrismaClient, Role, StageKind } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Aicc!2026';

/** Argon2id — OWASP tavsiya etgan parametrlar. */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function main() {
  console.log('Seed boshlandi...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: { name: 'AiCC' },
    create: {
      name: 'AiCC',
      slug: 'demo',
      timezone: 'Asia/Tashkent',
      locale: 'uz',
    },
  });

  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  const userSeeds: Array<{
    email: string;
    fullName: string;
    roles: Role[];
    sipExtension?: string;
  }> = [
    { email: 'admin@aicc.uz', fullName: 'Tizim Administratori', roles: [Role.ADMIN] },
    { email: 'manager@aicc.uz', fullName: 'Call-markaz Menejeri', roles: [Role.MANAGER] },
    {
      email: 'supervisor@aicc.uz',
      fullName: 'Nazoratchi Supervisor',
      roles: [Role.SUPERVISOR],
      sipExtension: '1001',
    },
    {
      email: 'operator1@aicc.uz',
      fullName: 'Dilnoza Karimova',
      roles: [Role.OPERATOR],
      sipExtension: '1002',
    },
    {
      email: 'operator2@aicc.uz',
      fullName: 'Sardor Yusupov',
      roles: [Role.OPERATOR],
      sipExtension: '1003',
    },
    {
      email: 'ai-agent@aicc.uz',
      fullName: 'AI Virtual Operator',
      roles: [Role.AI_AGENT],
      sipExtension: '1900',
    },
  ];

  for (const seed of userSeeds) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: seed.email } },
      update: { roles: seed.roles, fullName: seed.fullName },
      create: {
        tenantId: tenant.id,
        email: seed.email,
        fullName: seed.fullName,
        passwordHash,
        roles: seed.roles,
        sipExtension: seed.sipExtension,
        // Softfon Asterisk ga shu parol bilan ro'yxatdan o'tadi.
        sipPassword: seed.sipExtension ? `sip_${seed.sipExtension}_dev` : null,
      },
    });
  }
  console.log(`  ${userSeeds.length} ta foydalanuvchi tayyor (parol: ${DEMO_PASSWORD})`);

  const pipeline = await prisma.pipeline.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Asosiy voronka' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Asosiy voronka', isDefault: true },
  });

  const stageSeeds = [
    { name: 'Yangi', position: 0, kind: StageKind.OPEN, color: '#64748b' },
    { name: "Bog'lanildi", position: 1, kind: StageKind.OPEN, color: '#0ea5e9' },
    { name: 'Qiziqish bildirdi', position: 2, kind: StageKind.OPEN, color: '#8b5cf6' },
    { name: 'Bitim', position: 3, kind: StageKind.OPEN, color: '#f59e0b' },
    { name: 'Yopildi', position: 4, kind: StageKind.WON, color: '#22c55e' },
    { name: 'Rad etildi', position: 5, kind: StageKind.LOST, color: '#ef4444' },
  ];

  for (const stage of stageSeeds) {
    const existing = await prisma.pipelineStage.findUnique({
      where: { pipelineId_position: { pipelineId: pipeline.id, position: stage.position } },
    });
    if (!existing) {
      await prisma.pipelineStage.create({
        data: { ...stage, tenantId: tenant.id, pipelineId: pipeline.id },
      });
    }
  }
  console.log(`  Voronka "${pipeline.name}" va ${stageSeeds.length} ta bosqich tayyor`);

  const queueSeeds = [
    { name: 'Umumiy navbat', extension: '2000', strategy: 'round_robin', slaSeconds: 20 },
    { name: 'Texnik yordam', extension: '2001', strategy: 'fewest_calls', slaSeconds: 30 },
    { name: 'Sotuv', extension: '2002', strategy: 'least_recent', slaSeconds: 15 },
  ];
  for (const queue of queueSeeds) {
    await prisma.queue.upsert({
      where: { tenantId_extension: { tenantId: tenant.id, extension: queue.extension } },
      update: {},
      create: { ...queue, tenantId: tenant.id },
    });
  }
  console.log(`  ${queueSeeds.length} ta navbat tayyor`);

  const templateSeeds = [
    {
      name: "Qo'ng'iroq eslatmasi",
      body: "Hurmatli {{ism}}, sizga {{sana}} kuni soat {{vaqt}} da qo'ng'iroq qilamiz. AiCC",
      variables: ['ism', 'sana', 'vaqt'],
    },
    {
      name: 'Rahmat xabari',
      body: "Hurmatli {{ism}}, murojaatingiz uchun rahmat. Savollaringiz bo'lsa, javob bering.",
      variables: ['ism'],
    },
  ];
  for (const template of templateSeeds) {
    await prisma.smsTemplate.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: template.name } },
      update: {},
      create: { ...template, tenantId: tenant.id },
    });
  }
  console.log(`  ${templateSeeds.length} ta SMS shabloni tayyor`);

  // Eski seed/demo kontaktlar (agar qolgan bo'lsa) — tozalanadi.
  const deleted = await prisma.contact.deleteMany({
    where: { tenantId: tenant.id, source: 'seed' },
  });
  if (deleted.count > 0) {
    console.log(`  ${deleted.count} ta eski demo kontakt o'chirildi`);
  }

  console.log('Seed yakunlandi.');
}

main()
  .catch((error) => {
    console.error('Seed xatosi:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
