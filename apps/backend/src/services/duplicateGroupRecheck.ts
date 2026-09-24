/**
 * Re-check every duplicate group a changed document belongs to, and rewrite
 * the duplicate verdict of any copy in them whose verdict changed.
 *
 * WHY. Rule D's verdict on a copy depends on its twins: which of them stays
 * counted (duplicateRule.ts). The rule engine only ever judged the document
 * being written, so a change to one copy left its twins' verdicts stale:
 *   - rejecting the copy that stays counted left every twin flagged, and the
 *     receipt left the ledger silently (the risk recorded on the board under
 *     "Duplicates the rule engine never saw", "Rejecting an original drops the
 *     receipt");
 *   - a new upload that outranks the current keeper (a CAD reading of a
 *     receipt stored USD) was flagged itself, or left two copies counted.
 *
 * WHEN. After every change that can move a copy into, out of, or up or down a
 * group: an upload or a re-extraction (whatever its outcome), a correction or
 * any other fix action, a status change, and the stale sweep. The caller
 * passes the document's vendor names from BEFORE and AFTER the change, so the
 * group it left is re-checked as well as the group it joined.
 *
 * WHAT IT WRITES. Exactly what scripts/duplicateReevaluate.ts writes: the
 * `decision` and `decision_reason` facts of a copy whose duplicate verdict
 * changed, nothing else. Document.status and review_action are never written,
 * and rules A, B and C are not run (duplicateReevaluation.ts).
 *
 * SCOPE. Only the documents of that organisation whose FIRST vendor (the
 * merchant the engine judges them by) is one of the passed vendors are
 * written: their whole candidate pool is what the query loads, so their
 * verdict is computed from complete information. A document that merely also
 * carries one of those vendors is read as a candidate, never written.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { formatErrorForLog } from '../redaction';
import { planDuplicateReevaluation, PlannedChange, REEVAL_SELECT, rowToReevalDoc, vendorKey } from './duplicateReevaluation';

export const RECHECK_SOURCE = 'duplicate_recheck';

type Db = Prisma.TransactionClient | PrismaClient;

/** The VENDOR canonical names a document carries now. */
export async function vendorNamesOf(db: Db, documentId: string): Promise<string[]> {
  const rows = await db.documentEntity.findMany({
    where: { documentId, entity: { entityType: 'VENDOR' } },
    select: { entity: { select: { canonicalName: true } } },
  });
  return rows.map(r => r.entity.canonicalName);
}

/** The two decision facts of one planned change, replaced together. */
export async function writePlannedChange(tx: Prisma.TransactionClient, c: PlannedChange, sourceSpan: string): Promise<void> {
  await tx.documentFact.deleteMany({ where: { documentId: c.id, key: { in: ['decision', 'decision_reason'] } } });
  await tx.documentFact.create({ data: { documentId: c.id, factType: 'RULE_RESULT', key: 'decision', valueString: c.after.decision, confidence: 1.0, sourceSpan, isReviewed: false } });
  if (c.after.reason) {
    await tx.documentFact.create({ data: { documentId: c.id, factType: 'RULE_RESULT', key: 'decision_reason', valueString: c.after.reason, confidence: 1.0, sourceSpan, isReviewed: false } });
  }
}

export async function recheckDuplicateGroups(
  prisma: PrismaClient,
  organizationId: string,
  vendorNames: (string | null | undefined)[],
): Promise<PlannedChange[]> {
  const keys = [...new Set(vendorNames.filter((v): v is string => !!v).map(vendorKey).filter(Boolean))];
  if (!keys.length) return [];

  return prisma.$transaction(async (tx) => {
    // One re-check per organisation at a time. Two copies of one receipt
    // finishing together would otherwise each plan from the other's
    // pre-write state, and both could stay counted.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`duplicate-recheck:${organizationId}`}))`;

    const rows = await tx.document.findMany({
      where: {
        organizationId,
        documentEntities: {
          some: {
            entity: {
              entityType: 'VENDOR',
              OR: keys.map(k => ({ canonicalName: { equals: k, mode: 'insensitive' as const } })),
            },
          },
        },
      },
      select: REEVAL_SELECT,
    });
    const docs = rows.map(rowToReevalDoc);
    const plan = planDuplicateReevaluation(docs);
    const writable = new Set(docs.filter(d => d.vendors.length && keys.includes(vendorKey(d.vendors[0]))).map(d => d.id));

    for (const r of plan.refused) {
      if (writable.has(r.id)) console.warn(`[DuplicateRecheck] Left ${r.id} unchanged: ${r.why}`);
    }
    const changes = plan.changes.filter(c => writable.has(c.id));
    for (const c of changes) await writePlannedChange(tx, c, RECHECK_SOURCE);
    return changes;
  }, { timeout: 20000 });
}

/**
 * The re-check as a caller runs it after a change: it never throws. A failed
 * re-check leaves the verdicts as the change left them, which is what they were
 * before this re-check existed, and the log line names the document.
 */
export async function recheckAfterChange(
  prisma: PrismaClient,
  documentId: string,
  organizationId: string,
  vendorNamesBefore: (string | null | undefined)[],
): Promise<void> {
  try {
    const after = await vendorNamesOf(prisma, documentId);
    const changes = await recheckDuplicateGroups(prisma, organizationId, [...vendorNamesBefore, ...after]);
    if (changes.length) {
      console.log(
        `[DuplicateRecheck] After a change to ${documentId}: ${changes.length} verdict(s) rewritten ` +
          `(${changes.map(c => `${c.id} ${c.action}`).join(', ')})`,
      );
    }
  } catch (err) {
    console.error(`[DuplicateRecheck] Re-check after a change to ${documentId} failed; twins keep their previous verdicts:`, formatErrorForLog(err));
  }
}
