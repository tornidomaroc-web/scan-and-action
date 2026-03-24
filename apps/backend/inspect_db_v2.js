const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      originalFileName: true,
      uploadedAt: true,
      status: true,
      organizationId: true
    }
  });

  console.log(JSON.stringify(docs, null, 2));
}

main().finally(() => prisma.$disconnect());
