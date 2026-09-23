/**
 * Backfill: classify stored document text with the extractor's category enum
 * and write it as the `category` fact. Scoped, by construction, to the
 * owner's two organisations and the review account (the prefixes below); no
 * other organisation's text is ever sent anywhere (WORK-QUEUE CONSTRAINT).
 *
 *   npx tsx scripts/recategorize.ts            # DRY RUN: prints the exact scope, writes nothing, calls no model
 *   npx tsx scripts/recategorize.ts --write    # one text-only Gemini call per document, paced, then upsert
 *
 * Cost, stated: exactly one generateContent call per document in scope, no
 * image, ~1-2k tokens each; no scan is charged (the Document row is not
 * touched, and scanCount/scanChargedAt are never read or written here).
 * Pacing is PACE_MS between calls. A 429 stops the run; nothing partial is
 * hidden: every write is logged by id prefix and source.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CategoryClassifier } from '../src/services/extraction/categoryClassifier';
import { ExpenseCategorizationService } from '../src/services/expenseCategorizationService';

export const OUR_ORG_PREFIXES = ['d8b34ee3', '5ce3e185', '22d51116'] as const;
const PACE_MS = 5000;
const SOURCE = 'extractor_backfill';

async function main() {
  const write = process.argv.includes('--write');
  const prisma = new PrismaClient();
  const orgs = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM "Organization" WHERE left(id::text, 8) = ANY(${[...OUR_ORG_PREFIXES]}::text[])`;
  if (orgs.length !== OUR_ORG_PREFIXES.length) throw new Error(`scope control failed: ${orgs.length} organisations match ${OUR_ORG_PREFIXES.length} prefixes`);
  const orgIds = orgs.map(o => o.id);

  const docs = await prisma.document.findMany({
    where: { organizationId: { in: orgIds }, rawText: { not: '' } },
    select: { id: true, organizationId: true, rawText: true,
      documentEntities: { select: { entity: { select: { entityType: true, canonicalName: true } } } },
      facts: { where: { key: 'category' }, select: { id: true, valueString: true, sourceSpan: true } } },
    orderBy: { uploadedAt: 'asc' },
  });
  const outside = await prisma.document.count({ where: { organizationId: { notIn: orgIds }, rawText: { not: '' } } });
  const byOrg: Record<string, number> = {};
  for (const d of docs) byOrg[d.organizationId.slice(0, 8)] = (byOrg[d.organizationId.slice(0, 8)] || 0) + 1;
  console.log(`scope: ${docs.length} documents with text across ${Object.keys(byOrg).length} organisations ${JSON.stringify(byOrg)}; ${outside} documents outside the scope are NOT touched`);
  console.log(`already carrying a category: ${docs.filter(d => d.facts.length).length}; model calls if --write: ${docs.length}; scans charged: 0`);
  if (!write) { console.log('dry run: nothing written, no model called. Add --write to run.'); await prisma.$disconnect(); return; }
  // --expect N: the count the dry run resolved. A different count at run time
  // means the world moved between the order and the run; refuse, do not adapt.
  const expectArg = process.argv.find(a => a.startsWith('--expect='));
  if (expectArg && Number(expectArg.slice(9)) !== docs.length) {
    throw new Error(`scope moved: expected ${expectArg.slice(9)} documents, resolved ${docs.length}; nothing written`);
  }

  const classifier = new CategoryClassifier();
  const fallback = new ExpenseCategorizationService();
  let n = 0, fromModel = 0, fromKeywords = 0;
  for (const d of docs) {
    const merchant = d.documentEntities.find(e => e.entity.entityType === 'VENDOR')?.entity.canonicalName ?? null;
    const modelCat = await classifier.classify(d.rawText, merchant);
    const category = modelCat ?? fallback.categorize({ merchantName: merchant, rawText: d.rawText, facts: [] }).category;
    const source = modelCat ? SOURCE : 'auto_categorization';
    modelCat ? fromModel++ : fromKeywords++;
    const existing = d.facts[0];
    if (existing) {
      await prisma.documentFact.update({ where: { id: existing.id }, data: { valueString: category, sourceSpan: source, confidence: modelCat ? 0.9 : 0.5 } });
    } else {
      await prisma.documentFact.create({ data: { documentId: d.id, factType: 'CATEGORY', key: 'category', valueString: category, confidence: modelCat ? 0.9 : 0.5, sourceSpan: source, isReviewed: false } });
    }
    n++;
    console.log(`${d.id.slice(0, 8)} ${category.padEnd(10)} ${source}${existing ? ` (was ${existing.valueString})` : ''}`);
    if (n < docs.length) await new Promise(r => setTimeout(r, PACE_MS));
  }
  console.log(`done: ${n} written, ${fromModel} from the model, ${fromKeywords} from keywords`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('failed:', e?.constructor?.name, (e?.message || '').slice(0, 200)); process.exit(1); });
