const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const docId = 'a15572b7-386f-423f-85e3-a1f0faeaf917';
  
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { facts: true }
  });

  const CONFIDENCE_THRESHOLD = 0.98;
  const rawConfidence = doc.overallConfidence ?? 0;
  const normalizedOverallConfidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

  const hasDate = doc.facts.some(f => f.factType === 'DATE');
  const hasAmount = doc.facts.some(f => f.factType === 'AMOUNT');
  const isEmpty = doc.facts.length === 0;

  const text = (doc.rawText || '').toLowerCase();
  const anchors = ['total', 'subtotal', 'tax', 'vat', 'amount', 'item', 'receipt', 'invoice', 'cash', 'card', 'payment', 'merchant', 'store'];
  const foundAnchors = anchors.filter(anchor => text.includes(anchor));
  const hasAnchors = foundAnchors.length >= 2;

  const isWeak = normalizedOverallConfidence < 0.6 || isEmpty || !hasDate || !hasAmount || !hasAnchors;

  console.log(`[EVIDENCE] ID: ${docId}`);
  console.log(`[EVIDENCE] Confidence: ${normalizedOverallConfidence}`);
  console.log(`[EVIDENCE] hasDate: ${hasDate}`);
  console.log(`[EVIDENCE] hasAmount: ${hasAmount}`);
  console.log(`[EVIDENCE] foundAnchors: [${foundAnchors.join(', ')}]`);
  console.log(`[EVIDENCE] hasAnchors: ${hasAnchors}`);
  console.log(`[EVIDENCE] isWeak: ${isWeak}`);
  console.log(`[EVIDENCE] Status: ${doc.status}`);
  console.log(`[EVIDENCE] AmountFactValue: ${doc.facts.find(f => f.factType === 'AMOUNT')?.valueNumber}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
