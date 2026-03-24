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

  console.log('--- DATABASE INSPECTION ---');
  console.log(`Total Documents: ${docs.length}`);
  console.log('First 20 documents (DESC):');
  docs.slice(0, 20).forEach((d, i) => {
    console.log(`${i+1}. ID: ${d.id} | Name: ${d.originalFileName} | Status: ${d.status} | Uploaded: ${d.uploadedAt} | Org: ${d.organizationId}`);
  });
}

main().finally(() => prisma.$disconnect());
