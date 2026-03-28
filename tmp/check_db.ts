import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- FETCHING RECENT DOCUMENTS ---');
  const docs = await prisma.document.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 5,
    include: {
      facts: true
    }
  });

  docs.forEach(doc => {
    console.log(`\nID: ${doc.id}`);
    console.log(`File: ${doc.originalFileName}`);
    console.log(`Status: ${doc.status}`);
    console.log(`Confidence: ${doc.overallConfidence}`);
    console.log(`RawText Snippet: ${doc.rawText.substring(0, 200)}...`);
    console.log(`Facts Count: ${doc.facts.length}`);
    doc.facts.forEach(f => {
       console.log(` - Fact: ${f.factType} (${f.key}): ${f.valueString || f.valueNumber || f.valueDate}`);
    });
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
