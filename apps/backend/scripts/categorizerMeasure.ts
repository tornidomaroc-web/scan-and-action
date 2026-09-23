/**
 * Measurement: compare the stored `category` fact against a labelled set and
 * print the set size, the accuracy, the "Other" share and the confusion, split
 * by script (Latin / Arabic). Read-only.
 *
 *   npx tsx scripts/categorizerMeasure.ts scripts/categorizerLabels.json
 *
 * The labels file maps an 8-character document id prefix to a category from
 * expenseCategories.ts, or to "skip" for a document that is not a receipt
 * (a template, a screenshot, a form). Skipped documents are counted and
 * excluded; they are not silently dropped. Documents outside the owner's
 * three organisations are refused, whatever the file says.
 */
import 'dotenv/config';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { EXPENSE_CATEGORIES } from '../src/services/expenseCategories';

const OUR = ['d8b34ee3', '5ce3e185', '22d51116'];
const ARABIC = /[؀-ۿ]/;

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: categorizerMeasure.ts <labels.json>');
  const labels: Record<string, string> = JSON.parse(fs.readFileSync(file, 'utf8'));
  const prisma = new PrismaClient();
  const docs = await prisma.document.findMany({
    where: { rawText: { not: '' } },
    select: { id: true, organizationId: true, rawText: true, facts: { where: { key: 'category' }, select: { valueString: true, sourceSpan: true } } },
  });
  const byPrefix = new Map(docs.map(d => [d.id.slice(0, 8), d]));
  let skipped = 0, refused = 0, missing = 0;
  const rows: { script: string; label: string; got: string; source: string }[] = [];
  for (const [prefix, label] of Object.entries(labels)) {
    const d = byPrefix.get(prefix);
    if (!d) { missing++; continue; }
    if (!OUR.includes(d.organizationId.slice(0, 8))) { refused++; continue; }
    if (label === 'skip') { skipped++; continue; }
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(label)) throw new Error(`unknown label ${label} for ${prefix}`);
    const f = d.facts[0];
    rows.push({ script: ARABIC.test(d.rawText) ? 'arabic' : 'latin', label, got: f?.valueString ?? '(none)', source: f?.sourceSpan ?? '(none)' });
  }
  console.log(`labelled entries: ${Object.keys(labels).length}; measured: ${rows.length}; skipped as non-receipts: ${skipped}; refused (outside scope): ${refused}; ids not found: ${missing}`);
  for (const script of ['latin', 'arabic']) {
    const r = rows.filter(x => x.script === script);
    if (!r.length) { console.log(`${script}: n=0 — NOT COVERED by this set`); continue; }
    const correct = r.filter(x => x.got === x.label).length;
    const other = r.filter(x => x.got === 'Other').length;
    console.log(`${script}: n=${r.length} accuracy=${(100 * correct / r.length).toFixed(1)}% (${correct}/${r.length}) "Other" share=${(100 * other / r.length).toFixed(1)}% (${other}/${r.length})`);
    const confusion: Record<string, number> = {};
    for (const x of r) if (x.got !== x.label) confusion[`${x.label} -> ${x.got}`] = (confusion[`${x.label} -> ${x.got}`] || 0) + 1;
    for (const [k, v] of Object.entries(confusion).sort((a, b) => b[1] - a[1])) console.log(`   ${v}x ${k}`);
    const sources: Record<string, number> = {};
    for (const x of r) sources[x.source] = (sources[x.source] || 0) + 1;
    console.log(`   sources: ${JSON.stringify(sources)}`);
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error('failed:', e?.constructor?.name, (e?.message || '').slice(0, 200)); process.exit(1); });
