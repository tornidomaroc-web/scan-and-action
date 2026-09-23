/**
 * READ-ONLY reconciliation of GET /api/ledger against a direct database read.
 *
 *   npx tsx scripts/ledgerReconcile.ts --org=d8b34ee3 [--tz=Africa/Casablanca] [--month=2026-09] [--rows]
 *
 * For every month the organisation has a row in (or the one given), it runs the
 * endpoint's own read (readLedgerMonth) and, beside it, the same rules written a
 * second time in SQL: status, corrected-over-extracted amount, duplicate and
 * keep, printed date or upload day in the zone, currency code, category. Then
 * it compares document by document (which rows count, and each row's date,
 * figure, currency and category), per currency total, per category line, and
 * the excluded counts. SQL adds in numeric, the service in integer thousandths,
 * so a rounding drift between them shows as a mismatch rather than hiding.
 *
 * Scope: ONLY the owner's organisations (OUR_ORG_PREFIXES, WORK-QUEUE
 * CONSTRAINT); any other prefix is refused before anything is read. One
 * transaction opened with SET TRANSACTION READ ONLY, asserted before any read.
 * Exit code 1 on any mismatch. `--rows` prints every document; without it,
 * only mismatches and the per-month summary, so amounts are not printed by
 * default.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { readLedgerMonth } from '../src/services/ledger/ledgerService';
import { isValidMonth, isValidTimeZone } from '../src/services/ledger/ledgerCore';

// The same three prefixes as recategorize.ts. Not imported from it: importing
// that file runs its main(), which reads outside this transaction.
const OUR_ORG_PREFIXES = ['d8b34ee3', '5ce3e185', '22d51116'] as const;

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

interface SqlRow {
  id: string;
  status: string;
  day: string;
  date_source: string;
  counted: boolean;
  reason: string | null;
  figure: string | null; // numeric(,3) as text
  corrected: boolean;
  currency: string | null;
  category: string | null;
}

async function main() {
  const prefix = arg('org');
  const tz = arg('tz') ?? 'UTC';
  const onlyMonth = arg('month');
  const printRows = process.argv.includes('--rows');
  if (!prefix || !(OUR_ORG_PREFIXES as readonly string[]).includes(prefix)) {
    throw new Error(`--org must be one of ${OUR_ORG_PREFIXES.join(', ')}; nothing was read`);
  }
  if (!isValidTimeZone(tz)) throw new Error(`invalid --tz ${tz}`);
  if (onlyMonth !== undefined && !isValidMonth(onlyMonth)) throw new Error(`invalid --month ${onlyMonth}`);

  const prisma = new PrismaClient();
  let mismatches = 0;
  const miss = (msg: string) => { mismatches++; console.log(`MISMATCH ${msg}`); };

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const ro = await tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`;
    if (ro[0]?.transaction_read_only !== 'on') throw new Error('transaction is not read-only; nothing was read');
    console.log('transaction_read_only = on');

    const orgs = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM "Organization" WHERE left(id::text, 8) = ${prefix}`;
    if (orgs.length !== 1) throw new Error(`prefix ${prefix} resolves to ${orgs.length} organisations`);
    const orgId = orgs[0].id;

    const rows = await tx.$queryRaw<SqlRow[]>(Prisma.sql`
      WITH f AS (
        SELECT d.id, d.status, d."uploadedAt",
          (SELECT x."valueNumber" FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'manual_amount' LIMIT 1) AS manual,
          (SELECT x."valueNumber" FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'TOTAL_AMOUNT' LIMIT 1) AS extracted,
          (SELECT x.currency FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'TOTAL_AMOUNT' LIMIT 1) AS cur,
          (SELECT x."valueString" FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'category' LIMIT 1) AS cat,
          (SELECT x."valueDate" FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'TRANSACTION_DATE' AND x."valueDate" IS NOT NULL LIMIT 1) AS printed,
          EXISTS (SELECT 1 FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'decision_reason' AND x."valueString" LIKE '%Possible duplicate expense%') AS dup,
          EXISTS (SELECT 1 FROM "DocumentFact" x WHERE x."documentId" = d.id AND x.key = 'review_action' AND x."valueString" = 'marked_valid') AS kept
        FROM "Document" d WHERE d."organizationId"::text = ${orgId}
      )
      SELECT id::text AS id, status,
        to_char(COALESCE(printed, ("uploadedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
        CASE WHEN printed IS NULL THEN 'uploaded' ELSE 'document' END AS date_source,
        (status IN ('COMPLETED', 'NEEDS_REVIEW') AND COALESCE(manual, extracted) IS NOT NULL AND NOT (dup AND NOT kept)) AS counted,
        CASE WHEN status NOT IN ('COMPLETED', 'NEEDS_REVIEW') THEN 'status'
             WHEN COALESCE(manual, extracted) IS NULL THEN 'noAmount'
             WHEN dup AND NOT kept THEN 'duplicate' END AS reason,
        round(COALESCE(manual, extracted)::numeric, 3)::text AS figure,
        (manual IS NOT NULL) AS corrected,
        CASE WHEN upper(btrim(cur)) ~ '^[A-Z]{3}$' THEN upper(btrim(cur)) END AS currency,
        CASE WHEN cat IN ('Food','Transport','Travel','Shopping','Health','Bills','Office','Other') THEN cat END AS category
      FROM f ORDER BY day DESC, id`);

    const counted = rows.filter(r => r.counted).length;
    console.log(`organisation ${prefix}: ${rows.length} documents, ${counted} counted by SQL across all months (positive control: must be > 0)`);
    if (counted === 0) throw new Error('positive control failed: SQL counts nothing, so a match would prove nothing');

    const months = [...new Set(rows.map(r => r.day.slice(0, 7)))].filter(m => !onlyMonth || m === onlyMonth).sort().reverse();
    const fx = (n: number) => n.toFixed(3);
    const num = (s: string | null) => (s === null ? null : Number(s).toFixed(3));
    let rowsChecked = 0;

    console.log(`time zone for undated rows: ${tz}; months: ${months.length}`);
    for (const month of months) {
      const svc = await readLedgerMonth(tx, orgId, month, tz);
      const sqlIn = rows.filter(r => r.day.slice(0, 7) === month);
      const svcReceipts = new Map(svc.currencies.flatMap(c => c.receipts.map(r => [r.documentId, { ...r, currency: c.currency }] as const)));

      for (const r of sqlIn) {
        rowsChecked++;
        const s = svcReceipts.get(r.id);
        const verdict = r.counted ? 'COUNTED' : `excluded:${r.reason}`;
        if (r.counted && !s) miss(`${month} ${r.id.slice(0, 8)} SQL counts it, the endpoint does not`);
        if (!r.counted && s) miss(`${month} ${r.id.slice(0, 8)} the endpoint counts it, SQL excludes it (${r.reason})`);
        if (r.counted && s) {
          if (s.date !== r.day) miss(`${r.id.slice(0, 8)} date ${s.date} vs SQL ${r.day}`);
          if (s.dateSource !== r.date_source) miss(`${r.id.slice(0, 8)} dateSource ${s.dateSource} vs SQL ${r.date_source}`);
          if (fx(s.amount) !== num(r.figure)) miss(`${r.id.slice(0, 8)} figure ${fx(s.amount)} vs SQL ${num(r.figure)}`);
          if ((s.amountSource === 'corrected') !== r.corrected) miss(`${r.id.slice(0, 8)} corrected flag differs`);
          if (s.currency !== r.currency) miss(`${r.id.slice(0, 8)} currency ${s.currency} vs SQL ${r.currency}`);
          if (s.category !== r.category) miss(`${r.id.slice(0, 8)} category ${s.category} vs SQL ${r.category}`);
        }
        if (printRows) {
          console.log(`  ${month} ${r.id.slice(0, 8)} ${r.status.padEnd(12)} ${r.day} ${r.date_source.padEnd(8)} ${(r.currency ?? '???').padEnd(3)} ${(num(r.figure) ?? '-').padStart(10)}${r.corrected ? '*' : ' '} ${(r.category ?? '(none)').padEnd(9)} SQL ${verdict.padEnd(18)} endpoint ${s ? 'COUNTED' : 'not counted'}  ${(r.counted === !!s) ? 'match' : 'MISMATCH'}`);
        }
      }
      for (const id of svcReceipts.keys()) if (!sqlIn.some(r => r.id === id)) miss(`${month} ${id.slice(0, 8)} the endpoint lists a row SQL does not date to this month`);

      // Totals and category lines, summed by SQL in numeric.
      const sums = await tx.$queryRaw<{ currency: string | null; category: string; total: string; n: number }[]>(Prisma.sql`
        SELECT currency, COALESCE(category, 'Other') AS category, sum(figure::numeric)::text AS total, count(*)::int AS n
        FROM (VALUES ${Prisma.join(sqlIn.filter(r => r.counted).map(r => Prisma.sql`(${r.currency}::text, ${r.category}::text, ${r.figure}::text)`).concat(Prisma.sql`(NULL::text, NULL::text, NULL::text)`))}) v(currency, category, figure)
        WHERE figure IS NOT NULL GROUP BY 1, 2`);
      const sqlCur = new Map<string | null, number>();
      for (const s of sums) sqlCur.set(s.currency, (sqlCur.get(s.currency) ?? 0) + Number(s.total));
      for (const c of svc.currencies) {
        if (!sqlCur.has(c.currency)) miss(`${month} ${c.currency} line exists only in the endpoint`);
        else if (fx(c.total) !== fx(sqlCur.get(c.currency)!)) miss(`${month} ${c.currency} total ${fx(c.total)} vs SQL ${fx(sqlCur.get(c.currency)!)}`);
        const catSum = c.categories.reduce((a, l) => a + Math.round(l.total * 1000), 0) / 1000;
        if (fx(catSum) !== fx(c.total)) miss(`${month} ${c.currency} categories sum ${fx(catSum)} != total ${fx(c.total)}`);
        for (const l of c.categories) {
          const s = sums.find(x => x.currency === c.currency && x.category === l.category);
          const want = s ? fx(Number(s.total)) : fx(0);
          if (fx(l.total) !== want || l.receiptCount !== (s?.n ?? 0)) miss(`${month} ${c.currency} ${l.category} ${fx(l.total)}/${l.receiptCount} vs SQL ${want}/${s?.n ?? 0}`);
        }
      }
      for (const cur of sqlCur.keys()) if (!svc.currencies.some(c => c.currency === cur)) miss(`${month} ${cur} line exists only in SQL`);
      const sqlEx = { status: 0, duplicate: 0, noAmount: 0 } as Record<string, number>;
      for (const r of sqlIn) if (!r.counted) sqlEx[r.reason!]++;
      if (JSON.stringify(sqlEx) !== JSON.stringify(svc.excluded)) miss(`${month} excluded ${JSON.stringify(svc.excluded)} vs SQL ${JSON.stringify(sqlEx)}`);

      console.log(`${month}: endpoint ${svc.currencies.map(c => `${c.currency ?? '???'} ${fx(c.total)} (${c.receiptCount})`).join(' | ') || '(nothing counted)'}; excluded ${JSON.stringify(svc.excluded)}`);
    }
    const expected = onlyMonth ? rows.filter(r => r.day.startsWith(onlyMonth)).length : rows.length;
    if (rowsChecked !== expected) miss(`checked ${rowsChecked} rows, SQL has ${expected}`);
    console.log(`rows checked: ${rowsChecked}; mismatches: ${mismatches}`);
  }, { timeout: 120000 });

  await prisma.$disconnect();
  if (mismatches > 0) process.exit(1);
}

main().catch(e => { console.error('failed:', e?.constructor?.name, (e?.message || '').slice(0, 300)); process.exit(1); });
