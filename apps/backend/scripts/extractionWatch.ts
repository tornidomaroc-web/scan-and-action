/**
 * EXTRACTION FAILURE WATCH. Read-only. Prints the first-attempt extraction
 * outcome of every document in the database, split by era and by failure class.
 *
 *   cd apps/backend && npx tsx scripts/extractionWatch.ts [reextractGapMinutes=60]
 *
 * Run it from apps/backend so dotenv loads DATABASE_URL: the credential is never
 * read, printed or passed on the command line.
 *
 * READ-ONLY IS ENFORCED BY THE DATABASE, NOT BY INTENT. Every query runs inside
 * ONE transaction opened with SET TRANSACTION READ ONLY, and the script refuses
 * to read anything until `SHOW transaction_read_only` answers `on`. Postgres
 * rejects any write in that transaction whatever the code below says.
 * tests/extractionWatch.test.ts also fails if this file ever gains a Prisma
 * write method or a raw execute other than that one SET.
 *
 * NOTHING USER-DERIVED IS PRINTED: no text, no filename, no email, no org name.
 * rawText is read as a LENGTH only, organisations appear as rank numbers, and
 * the one document id printed (the known-failed control) is an 8-character prefix.
 *
 * CONTROLS, and no rate is printed unless all of them pass:
 *   C0  the transaction really is read-only
 *   C1  the database is populated (documents, facts, organisations all > 0),
 *       because zero rows from the wrong database reads exactly like zero rows
 *       from the right one
 *   C2  the predicate matches a KNOWN-FAILED row: the deliberately malformed
 *       upload 24c3ea41, which carries an extraction_error row
 *   C3  the predicate is not everything: at least one SUCCEEDED and one FAILED
 *   C4  no document whose status is FAILED classifies as SUCCEEDED
 *
 * The classification itself is extractionWatchClassify.ts, which explains why a
 * first attempt is judged by its traces and not by the row's current state.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { classify, gapMinutes, VENDOR_CLASSES, type DocRow, type Traces, type Classified } from './extractionWatchClassify';

const prisma = new PrismaClient();

// The deploys that changed what extraction RECORDS or DOES, as merged on main.
// Model names are the CODE DEFAULT in modelArm.ts at that commit; the
// GEMINI_PINNED_MODEL env var can override it at runtime, so they are not proof
// of what ran.
// These are facts about the repository's history (git log --first-parent main),
// not live state. A deploy serves a few minutes after its merge; the script
// reports how many uploads fall inside that window rather than assuming none.
const BOUNDARIES = [
  { at: new Date('2026-09-08T00:19:38Z'), sha: '924a95e', what: '#191 extraction_error starts being written' },
  { at: new Date('2026-09-08T16:56:21Z'), sha: '43461fd', what: '#193 class read from the HTTP status' },
  { at: new Date('2026-09-09T04:03:34Z'), sha: '3f3bf7b', what: '#196 code default becomes gemini-3.5-flash; the LAST change to the vendor call' },
];
const ERAS = [
  'A  before #191: no class was recorded',
  'B  #191 to #193: class recorded, keyword-guessed (a 429 could read OCR_FAILED)',
  'C  #193 to #196: class from the HTTP status; code default alias vs gemini-2.5-flash, then 2.5',
  'D  after #196: code default gemini-3.5-flash, current regime',
];
const DEPLOY_WINDOW_MINUTES = 10;
const KNOWN_FAILED_PREFIX = '24c3ea41';

function eraOf(d: Date): number {
  let e = 0;
  for (const b of BOUNDARIES) if (d >= b.at) e++;
  return e;
}

const pct = (n: number, d: number) => (d === 0 ? '   n/a' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

function fail(msg: string): never {
  console.error(`\nCONTROL FAILED: ${msg}\nNo rate is reported.`);
  process.exit(2);
}

async function main() {
  const gapArg = Number(process.argv[2] ?? 60);
  if (!Number.isFinite(gapArg) || gapArg <= 0) fail(`reextractGapMinutes must be a positive number, got ${process.argv[2]}`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const ro = await tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`;
    if (ro[0]?.transaction_read_only !== 'on') fail(`transaction_read_only is ${ro[0]?.transaction_read_only}, not on`);
    console.log('C0 read-only transaction: on');

    const [counts] = await tx.$queryRaw<{ docs: bigint; facts: bigint; orgs: bigint; newest: Date | null; oldest: Date | null }[]>`
      SELECT (SELECT count(*) FROM "Document") AS docs,
             (SELECT count(*) FROM "DocumentFact") AS facts,
             (SELECT count(*) FROM "Organization") AS orgs,
             (SELECT max("uploadedAt") FROM "Document") AS newest,
             (SELECT min("uploadedAt") FROM "Document") AS oldest`;
    const nDocs = Number(counts.docs), nFacts = Number(counts.facts), nOrgs = Number(counts.orgs);
    console.log(`C1 population: documents ${nDocs}, facts ${nFacts}, organisations ${nOrgs}, uploads ${counts.oldest?.toISOString()} .. ${counts.newest?.toISOString()}`);
    if (!(nDocs > 0 && nFacts > 0 && nOrgs > 0)) fail('the database is empty or is not the one the backend uses');

    const docs = await tx.$queryRaw<DocRow[]>`
      SELECT id::text AS id, "organizationId"::text AS "organizationId", status, "documentType",
             length("rawText")::int AS "rawLen", "overallConfidence", "uploadedAt", "processedAt"
      FROM "Document"`;
    const facts = await tx.$queryRaw<{ documentId: string; key: string; valueString: string | null }[]>`
      SELECT "documentId"::text AS "documentId", key, "valueString"
      FROM "DocumentFact"
      WHERE key IN ('extraction_error', 'extraction_recovered', 'delivery_error', 'extraction_model')`;
    if (docs.length !== nDocs) fail(`read ${docs.length} documents but counted ${nDocs}`);

    const traces = new Map<string, Traces>();
    const keyCount: Record<string, number> = {};
    for (const f of facts) {
      const t = traces.get(f.documentId) ?? {};
      keyCount[f.key] = (keyCount[f.key] ?? 0) + 1;
      if (f.key === 'extraction_error') { t.hasError = true; t.error = f.valueString; }
      if (f.key === 'extraction_recovered') { t.hasRecovered = true; t.recovered = f.valueString; }
      if (f.key === 'delivery_error') { t.hasDelivery = true; t.delivery = f.valueString; }
      if (f.key === 'extraction_model') t.hasModel = true;
      traces.set(f.documentId, t);
    }
    console.log(`   trace rows: ${['extraction_error', 'extraction_recovered', 'delivery_error', 'extraction_model'].map((k) => `${k} ${keyCount[k] ?? 0}`).join(', ')}`);

    const rows: (DocRow & { c: Classified; era: number })[] = docs.map((d) => ({
      ...d,
      overallConfidence: Number(d.overallConfidence),
      rawLen: Number(d.rawLen),
      c: classify({ ...d, overallConfidence: Number(d.overallConfidence), rawLen: Number(d.rawLen) }, traces.get(d.id) ?? {}, gapArg),
      era: eraOf(d.uploadedAt),
    }));

    // ── controls on the predicate ──────────────────────────────────────────
    const known = rows.filter((r) => r.id.startsWith(KNOWN_FAILED_PREFIX));
    if (known.length !== 1) fail(`expected exactly one document ${KNOWN_FAILED_PREFIX}…, found ${known.length}`);
    if (known[0].c.outcome !== 'FAILED') fail(`known-failed ${KNOWN_FAILED_PREFIX}… classified ${known[0].c.outcome}`);
    console.log(`C2 known-failed ${KNOWN_FAILED_PREFIX}…: ${known[0].c.outcome} via ${known[0].c.via}, class ${known[0].c.cls}`);
    const nS = rows.filter((r) => r.c.outcome === 'SUCCEEDED').length, nF = rows.filter((r) => r.c.outcome === 'FAILED').length;
    if (!(nS > 0 && nF > 0)) fail(`predicate is degenerate: ${nS} succeeded, ${nF} failed`);
    console.log(`C3 predicate discriminates: ${nS} succeeded, ${nF} failed`);
    const holes = rows.filter((r) => r.status === 'FAILED' && r.c.outcome === 'SUCCEEDED').length;
    if (holes !== 0) fail(`${holes} documents with status FAILED classify as SUCCEEDED`);
    console.log('C4 no FAILED-status document reads as a success: 0');

    // ── the clock, measured so the threshold can be judged ─────────────────
    const buckets: [string, (g: number | null) => boolean][] = [
      ['no processedAt', (g) => g === null],
      ['< 1 min', (g) => g !== null && g < 1],
      ['1-5 min', (g) => g !== null && g >= 1 && g < 5],
      ['5-15 min', (g) => g !== null && g >= 5 && g < 15],
      ['15-30 min', (g) => g !== null && g >= 15 && g < 30],
      ['30-60 min', (g) => g !== null && g >= 30 && g < 60],
      ['1-24 h', (g) => g !== null && g >= 60 && g < 1440],
      ['> 24 h', (g) => g !== null && g >= 1440],
    ];
    console.log(`\nprocessedAt - uploadedAt (threshold for "re-extracted" = ${gapArg} min)`);
    for (const [label, f] of buckets) {
      const inB = rows.filter((r) => f(gapMinutes(r)));
      const traced = inB.filter((r) => traces.get(r.id)?.hasRecovered).length;
      console.log(`  ${pad(label, 15)} ${lpad(inB.length, 4)}   of which carry extraction_recovered ${traced}`);
    }

    // ── first-attempt outcome by era ───────────────────────────────────────
    const OUTCOMES = ['SUCCEEDED', 'FAILED', 'DELIVERY_LOST', 'NEVER_PERSISTED', 'NOT_ATTEMPTED', 'UNRESOLVED'] as const;
    console.log('\nFIRST-ATTEMPT OUTCOME BY ERA (by uploadedAt)');
    console.log(`  ${pad('era', 78)} ${OUTCOMES.map((o) => lpad(o.slice(0, 9), 9)).join(' ')} | fail/(succ+fail)  user-got-nothing`);
    ERAS.forEach((label, e) => {
      const inE = rows.filter((r) => r.era === e);
      const c = Object.fromEntries(OUTCOMES.map((o) => [o, inE.filter((r) => r.c.outcome === o).length])) as Record<string, number>;
      const attempted = c.SUCCEEDED + c.FAILED + c.DELIVERY_LOST;
      console.log(`  ${pad(label, 78)} ${OUTCOMES.map((o) => lpad(c[o], 9)).join(' ')} | ${pct(c.FAILED, c.SUCCEEDED + c.FAILED)}           ${pct(c.FAILED + c.DELIVERY_LOST, attempted)}`);
    });
    for (const b of BOUNDARIES) {
      const near = rows.filter((r) => r.uploadedAt >= b.at && (r.uploadedAt.getTime() - b.at.getTime()) / 60000 < DEPLOY_WINDOW_MINUTES).length;
      console.log(`  uploads within ${DEPLOY_WINDOW_MINUTES} min after ${b.sha} merged (${b.what}): ${near}`);
    }

    // ── by month, so a regime change is visible without trusting a boundary ─
    console.log('\nFIRST-ATTEMPT OUTCOME BY MONTH');
    const months = [...new Set(rows.map((r) => r.uploadedAt.toISOString().slice(0, 7)))].sort();
    for (const m of months) {
      const inM = rows.filter((r) => r.uploadedAt.toISOString().startsWith(m));
      const s = inM.filter((r) => r.c.outcome === 'SUCCEEDED').length, f = inM.filter((r) => r.c.outcome === 'FAILED').length;
      const other = inM.length - s - f;
      console.log(`  ${m}  docs ${lpad(inM.length, 4)}  succeeded ${lpad(s, 4)}  failed ${lpad(f, 4)}  other ${lpad(other, 3)}  fail/(succ+fail) ${pct(f, s + f)}`);
    }

    // ── failure class by era, and how each failure was seen ───────────────
    console.log('\nFAILED FIRST ATTEMPTS BY CLASS AND ERA (via: error | recovered | empty | clock)');
    ERAS.forEach((label, e) => {
      const failed = rows.filter((r) => r.era === e && r.c.outcome === 'FAILED');
      if (failed.length === 0) return;
      console.log(`  ${label}`);
      const classes = [...new Set(failed.map((r) => r.c.cls ?? 'UNRECORDED'))].sort();
      for (const cls of classes) {
        const inC = failed.filter((r) => (r.c.cls ?? 'UNRECORDED') === cls);
        const via = ['error', 'recovered', 'empty', 'clock'].map((v) => inC.filter((r) => r.c.via === v).length).join(' | ');
        const kind = VENDOR_CLASSES.includes(cls) ? 'vendor' : cls === 'LowConfidence' ? 'poor document' : 'no class';
        console.log(`     ${pad(cls, 16)} ${lpad(inC.length, 4)}   via ${via}   still empty now ${inC.filter((r) => r.rawLen === 0).length}   [${kind}]`);
      }
    });

    // ── who and when, per era: a rate from one account's burst is not a rate ─
    // Organisations are anonymised by rank WITHIN the era, so org#1 in one era
    // is not necessarily org#1 in another.
    console.log('\nCONCENTRATION BY ERA (organisations ranked by uploads within the era)');
    ERAS.forEach((label, e) => {
      const inE = rows.filter((r) => r.era === e);
      if (inE.length === 0) return;
      const byOrg = new Map<string, { s: number; f: number; n: number }>();
      for (const r of inE) {
        const o = byOrg.get(r.organizationId) ?? { s: 0, f: 0, n: 0 };
        o.n++; if (r.c.outcome === 'SUCCEEDED') o.s++; if (r.c.outcome === 'FAILED') o.f++;
        byOrg.set(r.organizationId, o);
      }
      const days = [...new Set(inE.map((r) => r.uploadedAt.toISOString().slice(0, 10)))].sort();
      console.log(`  ${label}`);
      console.log(`     ${inE.length} uploads, ${byOrg.size} organisations, ${days.length} upload days (${days[0]} .. ${days[days.length - 1]})`);
      [...byOrg.values()].sort((a, b) => b.n - a.n).slice(0, 3).forEach((o, i) => {
        console.log(`     org#${i + 1}  uploads ${lpad(o.n, 4)} (${pct(o.n, inE.length).trim()} of era)  succeeded ${lpad(o.s, 4)}  failed ${lpad(o.f, 4)}  fail/(succ+fail) ${pct(o.f, o.s + o.f)}`);
      });
    });

    // ── witnesses, directional only ────────────────────────────────────────
    const brokenRecord = rows.filter((r) => traces.get(r.id)?.error === 'LowConfidence' && r.rawLen === 0 && r.overallConfidence === 0).length;
    const deliveryWitness = rows.filter((r) => r.c.via === 'witness').length;
    console.log(`\nWITNESSES (an INCREMENT means a recorder is broken; a decrement means a flagged row was fixed)`);
    console.log(`  BROKEN_RECORD_WITNESS  (LowConfidence on the empty shape)   ${brokenRecord}`);
    console.log(`  DELIVERY_RECORD_BROKEN (stub + extraction_model, no error, no delivery_error)   ${deliveryWitness}`);
  }, { timeout: 60_000, maxWait: 10_000 });
}

main()
  .catch((e) => { console.error('extractionWatch failed:', e?.constructor?.name ?? 'Error', e?.code ?? ''); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
