/**
 * Re-evaluate Rule D (duplicates) over the owner's three organisations.
 *
 *   npx tsx scripts/duplicateReevaluate.ts                       # DRY RUN: read-only, prints the plan and the ledger before/after
 *   npx tsx scripts/duplicateReevaluate.ts --write --expect=N    # writes the N planned changes, refuses any other count
 *
 * DUPLICATE RULE ONLY (services/duplicateReevaluation.ts says why). A row is
 * touched only when its duplicate verdict changes, and only its `decision` and
 * `decision_reason` facts are rewritten, with sourceSpan 'duplicate_reeval'.
 * Document.status, review_action and every other fact are never written. No
 * model is called and no scan is charged.
 *
 * The dry run runs inside SET TRANSACTION READ ONLY, asserted before any read,
 * and proves its own input: the ledger it computes from the rows it read must
 * equal GET /api/ledger's own read (readLedgerMonth) for every month, before
 * it reports what the plan would change.
 *
 * Scope: ONLY the three prefixes below (WORK-QUEUE CONSTRAINT), resolved to
 * exactly three organisations or nothing runs. Default output prints the
 * owner's own vendors and amounts; it is for his terminal, not for the PR.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildLedger, COUNTED_STATUSES, LedgerDocInput } from '../src/services/ledger/ledgerCore';
import { readLedgerMonth } from '../src/services/ledger/ledgerService';
import { comesFirst, resolvedAmount, copyCurrency, ownerMark } from '../src/services/duplicateRule';
import { applyPlan, copyGroupKey, isKept, Plan, planDuplicateReevaluation, REEVAL_SELECT, ReevalDoc, rowToReevalDoc } from '../src/services/duplicateReevaluation';
import { writePlannedChange } from '../src/services/duplicateGroupRecheck';

// The same three prefixes as recategorize.ts; not imported, because importing
// that file runs its main().
const OUR_ORG_PREFIXES = ['d8b34ee3', '5ce3e185', '22d51116'] as const;
const SOURCE = 'duplicate_reeval';

type Db = Prisma.TransactionClient;

async function readScope(tx: Db) {
  const orgs = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM "Organization" WHERE left(id::text, 8) = ANY(${[...OUR_ORG_PREFIXES]}::text[])`;
  if (orgs.length !== OUR_ORG_PREFIXES.length) throw new Error(`scope control failed: ${orgs.length} organisations match ${OUR_ORG_PREFIXES.length} prefixes`);
  const orgIds = orgs.map(o => o.id).sort();
  // The same select and mapping as the live re-check (duplicateGroupRecheck.ts).
  const rows = await tx.document.findMany({ where: { organizationId: { in: orgIds } }, select: REEVAL_SELECT });
  const docs: ReevalDoc[] = rows.map(rowToReevalDoc);
  const names = new Map(rows.map(r => [r.id, r.documentEntities[0]?.entity.displayName ?? r.documentEntities[0]?.entity.canonicalName ?? null]));
  return { orgIds, docs, names };
}

const asLedger = (docs: ReevalDoc[], names: Map<string, string | null>): LedgerDocInput[] =>
  docs.map(d => ({ id: d.id, status: d.status, uploadedAt: d.uploadedAt, merchant: names.get(d.id) ?? null, facts: d.facts }));

const printed = (d: ReevalDoc) => d.facts.find(f => f.key === 'TRANSACTION_DATE')?.valueDate?.toISOString().slice(0, 10) ?? '(undated)';
const isFlagged = (d: ReevalDoc) => (d.facts.find(f => f.key === 'decision_reason')?.valueString ?? '').includes('Possible duplicate expense');

/** Which document ids the ledger counts, across every month. */
function countedIds(docs: LedgerDocInput[]): Set<string> {
  const months = new Set<string>();
  for (const d of docs) {
    const td = d.facts.find(f => f.key === 'TRANSACTION_DATE')?.valueDate;
    months.add((td ? td.toISOString() : d.uploadedAt.toISOString()).slice(0, 7));
  }
  const ids = new Set<string>();
  for (const m of months) for (const c of buildLedger(docs, m, 'UTC').currencies) for (const r of c.receipts) ids.add(r.documentId);
  return ids;
}

function monthsOf(docs: LedgerDocInput[]): string[] {
  const s = new Set<string>();
  for (const d of docs) {
    const td = d.facts.find(f => f.key === 'TRANSACTION_DATE')?.valueDate;
    s.add((td ? td.toISOString() : d.uploadedAt.toISOString()).slice(0, 7));
  }
  return [...s].sort();
}

function report(orgIds: string[], docs: ReevalDoc[], names: Map<string, string | null>, plan: Plan): number {
  let failures = 0;
  const fail = (m: string) => { failures++; console.log(`FAIL ${m}`); };
  const after = applyPlan(docs, plan);
  const beforeL = asLedger(docs, names);
  const afterL = asLedger(after, names);
  const countedBefore = countedIds(beforeL);
  const countedAfter = countedIds(afterL);
  const changeOf = new Map(plan.changes.map(c => [c.id, c]));
  const afterById = new Map(after.map(d => [d.id, d]));

  console.log(`\nscope: ${docs.length} documents in ${orgIds.length} organisations; planned changes: ${plan.changes.length} ` +
    `(flag ${plan.changes.filter(c => c.action === 'flag').length}, unflag ${plan.changes.filter(c => c.action === 'unflag').length}); refused: ${plan.refused.length}`);
  for (const r of plan.refused) console.log(`  REFUSED ${r.id.slice(0, 8)} ${r.why}`);
  console.log(`Document.status written: 0 (never). review_action written: 0 (never). Other rules run: none.`);
  const firstDecision = plan.changes.filter(c => c.before.decision === null);
  console.log(`rows getting a decision for the first time (a banner appears on the document): ${firstDecision.length}`);
  const multiVendor = docs.filter(d => new Set(d.vendors.map(v => v.toLowerCase())).size > 1).length;
  const noVendor = docs.filter(d => resolvedAmount(d.facts) !== null && d.vendors.length === 0 && countedBefore.has(d.id)).length;
  console.log(`documents with more than one VENDOR entity: ${multiVendor}; counted rows with an amount and NO vendor (Rule D cannot see them): ${noVendor}`);

  // Groups: organisation + vendor + amount as the ledger reads it + currency.
  const groups = new Map<string, ReevalDoc[]>();
  for (const d of docs) {
    const k = copyGroupKey(d);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  const shown = [...groups.entries()].filter(([, m]) => m.length > 1 || m.some(d => changeOf.has(d.id)));
  console.log(`\ncopy groups (same organisation, vendor and amount) with 2+ members or a change: ${shown.length}\n`);
  let extraBefore = 0, extraAfter = 0;
  const crossCurrency: { k: string; members: ReevalDoc[] }[] = [];
  const counts = (d: ReevalDoc) => (COUNTED_STATUSES as readonly string[]).includes(d.status);
  for (const [k, members] of shown.sort(([a], [b]) => a.localeCompare(b))) {
    const [org] = k.split('|');
    const cur = [...new Set(members.map(d => copyCurrency(d.facts) ?? '???'))].join('/');
    if (cur.includes('/')) crossCurrency.push({ k, members });
    members.sort((a, b) => (comesFirst(a, b) ? -1 : 1));
    const amt = resolvedAmount(members[0].facts)!;
    const nb = members.filter(d => countedBefore.has(d.id)).length;
    const na = members.filter(d => countedAfter.has(d.id)).length;
    // Expected after the write: exactly one copy that stays counted (when any
    // member counts by status), plus every copy the owner kept as a duplicate.
    const keptCopies = members.filter(d => counts(d) && ownerMark(afterById.get(d.id)!.facts) === 'keptCopy').length;
    const unflaggedAfter = members.filter(d => counts(d) && !isFlagged(afterById.get(d.id)!)).length;
    const want = (members.some(counts) ? 1 : 0) + keptCopies;
    if (members.some(counts) && unflaggedAfter !== 1) fail(`group ${k} leaves ${unflaggedAfter} counted copies unflagged after, expected exactly 1`);
    extraBefore += Math.max(0, nb - want);
    extraAfter += Math.max(0, na - want);
    console.log(`${org.slice(0, 8)} ${String(names.get(members[0].id) ?? '?').slice(0, 28).padEnd(28)} ${cur.padEnd(7)} ${amt.toFixed(2).padStart(10)}  counted ${nb} -> ${na}${na === want ? '' : `  (expected ${want})`}`);
    for (const d of members) {
      const c = changeOf.get(d.id);
      const a = afterById.get(d.id)!;
      console.log(`    ${d.id.slice(0, 8)} ${d.status.padEnd(12)} up ${d.uploadedAt.toISOString().slice(0, 16)} printed ${printed(d).padEnd(10)} ` +
        `${(copyCurrency(d.facts) ?? '???').padEnd(3)} before ${(isFlagged(d) ? 'FLAGGED' : '-').padEnd(7)}${isKept(d) ? ' kept' : '     '} ${countedBefore.has(d.id) ? 'counted' : 'out    '}  ` +
        `after ${(isFlagged(a) ? 'FLAGGED' : '-').padEnd(7)} ${countedAfter.has(d.id) ? 'counted' : 'out    '}` +
        `${c ? `  ${c.action.toUpperCase()} (decision ${c.before.decision ?? 'none'} -> ${c.after.decision})` : ''}` +
        `${plan.originalOf.get(d.id) ? `  copy of ${plan.originalOf.get(d.id)!.slice(0, 8)}` : ''}`);
    }
    if (na !== want) fail(`group ${k} counts ${na} after, expected ${want}`);
  }
  console.log(`\nextra copies counted: before ${extraBefore}, after ${extraAfter}`);

  // Groups whose copies disagree on currency: the copy that stays counted,
  // and so the currency the ledger shows the receipt in, before and after.
  console.log(`\ncross-currency groups: ${crossCurrency.length}`);
  const beforeById = new Map(docs.map(d => [d.id, d]));
  const keeperOf = (members: ReevalDoc[], state: Map<string, ReevalDoc>, counted: Set<string>) =>
    members.filter(d => counted.has(d.id) && !isFlagged(state.get(d.id)!)).map(d => `${d.id.slice(0, 8)} ${copyCurrency(d.facts) ?? '???'}`).join(' + ') || '(none)';
  for (const { k, members } of crossCurrency) {
    const [org] = k.split('|');
    console.log(`  ${org.slice(0, 8)} ${String(names.get(members[0].id) ?? '?').slice(0, 28).padEnd(28)} ${resolvedAmount(members[0].facts)!.toFixed(2).padStart(10)}  ` +
      `copies (upload order): ${members.map(d => `${d.id.slice(0, 8)} ${copyCurrency(d.facts) ?? '???'} ${d.status}`).join(', ')}`);
    console.log(`      stays counted: before ${keeperOf(members, beforeById, countedBefore)}  ->  after ${keeperOf(members, afterById, countedAfter)}`);
  }
  // Idempotence: the state this plan writes must plan nothing further, so a
  // second run after the write is a no-op and a check that it took.
  const again = planDuplicateReevaluation(after).changes.length;
  console.log(`idempotence: re-planning the written state plans ${again} changes (must be 0)`);
  if (again !== 0) fail(`re-planning after the write plans ${again} changes`);
  const stray = plan.changes.filter(c => !copyGroupKey(docs.find(d => d.id === c.id)!) || !shown.some(([, m]) => m.some(d => d.id === c.id)));
  if (stray.length) fail(`${stray.length} changes fall outside every group`);

  // The ledger before and after, per organisation and month, where it moves.
  // Also printed when unchanged: every month holding a cross-currency copy.
  const always = new Set(crossCurrency.flatMap(({ members }) => members.map(d => {
    const td = d.facts.find(f => f.key === 'TRANSACTION_DATE')?.valueDate;
    return `${d.organizationId}|${(td ?? d.uploadedAt).toISOString().slice(0, 7)}`;
  })));
  console.log(`\nledger totals that move, and every month holding a cross-currency copy (UTC), before -> after:`);
  for (const org of orgIds) {
    const b = beforeL.filter(d => docs.find(x => x.id === d.id)!.organizationId === org);
    const a = afterL.filter(d => after.find(x => x.id === d.id)!.organizationId === org);
    for (const m of monthsOf(b)) {
      const lb = buildLedger(b, m, 'UTC'), la = buildLedger(a, m, 'UTC');
      const fmt = (l: typeof lb) => l.currencies.map(c => `${c.currency ?? '???'} ${c.total.toFixed(2)} (${c.receiptCount})`).join(' | ') || '(nothing)';
      if (fmt(lb) !== fmt(la) || m === '2026-02' || always.has(`${org}|${m}`)) console.log(`  ${org.slice(0, 8)} ${m}: ${fmt(lb)}  ->  ${fmt(la)}`);
    }
  }
  return failures;
}

async function main() {
  const write = process.argv.includes('--write');
  const expectArg = process.argv.find(a => a.startsWith('--expect='))?.slice(9);
  const prisma = new PrismaClient();

  if (!write) {
    let failures = 0;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const ro = await tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`;
      if (ro[0]?.transaction_read_only !== 'on') throw new Error('transaction is not read-only; nothing was read');
      console.log('DRY RUN. transaction_read_only = on. Nothing is written.');
      const { orgIds, docs, names } = await readScope(tx);

      // Input proof: the in-memory "before" ledger equals the endpoint's own
      // read for every month of every organisation.
      let months = 0;
      for (const org of orgIds) {
        const mine = asLedger(docs.filter(d => d.organizationId === org), names);
        for (const m of monthsOf(mine)) {
          months++;
          const ours = JSON.stringify(buildLedger(mine, m, 'UTC'));
          const theirs = JSON.stringify(await readLedgerMonth(tx, org, m, 'UTC'));
          if (ours !== theirs) { failures++; console.log(`FAIL input: ${org.slice(0, 8)} ${m} differs from GET /api/ledger`); }
        }
      }
      console.log(`input proof: ${months} organisation-months, in-memory ledger equals readLedgerMonth on ${months - failures}`);

      const plan = planDuplicateReevaluation(docs);
      failures += report(orgIds, docs, names, plan);
      console.log(`\nto write exactly this plan: npx tsx scripts/duplicateReevaluate.ts --write --expect=${plan.changes.length}`);
    }, { timeout: 120000 });
    await prisma.$disconnect();
    console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
    if (failures) process.exit(1);
    return;
  }

  if (expectArg === undefined) throw new Error('--write needs --expect=N, the change count the dry run printed; nothing written');
  await prisma.$transaction(async (tx) => {
    const { docs } = await readScope(tx);
    const plan = planDuplicateReevaluation(docs);
    if (plan.changes.length !== Number(expectArg)) {
      throw new Error(`scope moved: the dry run planned ${expectArg} changes, this run plans ${plan.changes.length}; nothing written`);
    }
    for (const c of plan.changes) {
      await writePlannedChange(tx, c, SOURCE);
      console.log(`${c.id.slice(0, 8)} ${c.action} ${c.before.decision ?? 'none'} -> ${c.after.decision}`);
    }
    console.log(`written: ${plan.changes.length} documents, decision facts only`);
  }, { timeout: 120000 });
  await prisma.$disconnect();
}

main().catch(e => { console.error('failed:', e?.constructor?.name, (e?.message || '').slice(0, 300)); process.exit(1); });
