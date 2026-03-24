const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      originalFileName: true,
      uploadedAt: true,
      organizationId: true
    }
  });

  console.log('--- ORG ID INSPECTION ---');
  docs.forEach((d, i) => {
    console.log(`${i+1}. ${d.originalFileName} | Org: ${d.organizationId}`);
  });
}

main().finally(() => prisma.$disconnect());
