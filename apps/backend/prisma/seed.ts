import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_USER_ID = 'sys-demo-user';
const DEV_USER_EMAIL = 'sys-demo-user@mock.local';

async function main() {
  console.log('🌱 Seeding database...');

  const user = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      preferredLanguage: 'en',
    },
  });

  console.log(`✅ Dev user ready: ${user.id} (${user.email})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
