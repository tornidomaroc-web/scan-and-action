
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.document.count();
  console.log('Total documents:', total);

  const statuses = await prisma.document.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  console.log('Status breakdown:', statuses);

  const confidenceStats = await prisma.document.aggregate({
    _min: { overallConfidence: true },
    _max: { overallConfidence: true },
    _avg: { overallConfidence: true }
  });
  console.log('Confidence stats:', confidenceStats);

  const lowConfidence = await prisma.document.findMany({
    where: { overallConfidence: { lt: 0.8 } },
    take: 5,
    select: { id: true, overallConfidence: true, status: true }
  });
  console.log('Low confidence docs (lt 0.8):', lowConfidence);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
