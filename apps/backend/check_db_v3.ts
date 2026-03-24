import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      originalFileName: true,
      status: true,
      uploadedAt: true,
      organizationId: true,
      overallConfidence: true
    }
  });

  console.log('--- RECENT DOCUMENTS IN DB ---');
  console.log(JSON.stringify(docs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
