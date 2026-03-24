const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

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

  let output = '--- ALL DOCUMENTS (DESC) ---\n';
  docs.forEach((d, i) => {
    output += `${i+1}. ${d.uploadedAt.toISOString()} | ${d.originalFileName} | ${d.status}\n`;
  });
  
  fs.writeFileSync('db_dump.txt', output);
}

main().finally(() => prisma.$disconnect());
