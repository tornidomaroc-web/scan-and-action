const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      originalFileName: true,
      uploadedAt: true,
      status: true
    }
  });

  console.log('--- ALL DOCUMENTS (DESC) ---');
  docs.forEach((d, i) => {
    console.log(`${i+1}. ${d.uploadedAt.toISOString()} | ${d.originalFileName} | ${d.status}`);
  });
}

main().finally(() => prisma.$disconnect());
