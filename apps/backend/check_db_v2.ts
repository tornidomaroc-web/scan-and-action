
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const docs = await prisma.document.findMany();
  console.log('ALL_DOCS_JSON_START');
  console.log(JSON.stringify(docs, null, 2));
  console.log('ALL_DOCS_JSON_END');
}
main().finally(() => prisma.$disconnect());
