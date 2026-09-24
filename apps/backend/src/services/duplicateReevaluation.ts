/**
 * The one-off re-evaluation of Rule D over stored documents, as a pure plan.
 * scripts/duplicateReevaluate.ts reads the rows, prints this plan, and writes it
 * only with --write.
 *
 * It runs the DUPLICATE RULE ONLY. Rules A, B and C (amount over 500, food over
 * 50, missing amount) are not run, so no warning appears on an old document for
 * any reason except that it is, or is no longer, a later copy. A row is touched
 * only when its duplicate verdict changes:
 *   - flag:   "Possible duplicate expense" is added to its decision_reason and
 *             its decision becomes FLAGGED (the highest priority, so no other
 *             rule's outcome can outrank it);
 *   - unflag: that reason is removed and the decision is recomputed from the
 *             reasons that remain, by the rule engine's own priority. With none
 *             left it is APPROVED.
 * Document.status is never written. review_action is never written, so a row
 * the owner kept stays kept.
 */
import { canonicalizeEntityName } from '../utils/canonicalName';
import { CopyCandidate, findOriginal, resolvedAmount, toMilli } from './duplicateRule';
import { DUPLICATE_REASON, KEEP_ACTION, LedgerFactInput } from './ledger/ledgerCore';

export type Decision = 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED';

/** Every reason the rule engine writes, with the decision it implies. */
export const REASON_DECISION: Record<string, Decision> = {
  'Amount exceeds threshold': 'NEEDS_REVIEW',
  'High food expense': 'FLAGGED',
  'Missing amount': 'NEEDS_REVIEW',
  [DUPLICATE_REASON]: 'FLAGGED',
};
const PRIORITY: Record<Decision, number> = { APPROVED: 1, NEEDS_REVIEW: 2, FLAGGED: 3 };

export interface ReevalDoc {
  id: string;
  organizationId: string;
  status: string;
  uploadedAt: Date;
  /** VENDOR entities' canonicalName, highest confidence first. */
  vendors: string[];
  facts: LedgerFactInput[];
}

export interface PlannedChange {
  id: string;
  organizationId: string;
  action: 'flag' | 'unflag';
  originalId: string | null;
  before: { decision: string | null; reason: string | null };
  after: { decision: Decision; reason: string };
}

export interface Refusal {
  id: string;
  why: string;
}

export interface Plan {
  changes: PlannedChange[];
  refused: Refusal[];
  /** Per document: the original it is a later copy of, or null. */
  originalOf: Map<string, string | null>;
}

const vendorKey = (name: string) => canonicalizeEntityName(name).toLowerCase();
const factValue = (d: ReevalDoc, key: string) => d.facts.find(f => f.key === key)?.valueString ?? null;

export function splitReasons(reason: string | null): string[] {
  return (reason ?? '').split(', ').map(r => r.trim()).filter(Boolean);
}

export function planDuplicateReevaluation(docs: ReevalDoc[]): Plan {
  const changes: PlannedChange[] = [];
  const refused: Refusal[] = [];
  const originalOf = new Map<string, string | null>();

  // Candidates by organisation and vendor key: what checkDuplicate's
  // `canonicalName equals, mode insensitive` over any VENDOR entity reaches.
  const byVendor = new Map<string, ReevalDoc[]>();
  for (const d of docs) {
    for (const v of new Set(d.vendors.map(vendorKey).filter(Boolean))) {
      const k = `${d.organizationId}|${v}`;
      if (!byVendor.has(k)) byVendor.set(k, []);
      byVendor.get(k)!.push(d);
    }
  }
  const asCandidate = (d: ReevalDoc): CopyCandidate => ({ id: d.id, uploadedAt: d.uploadedAt, status: d.status, facts: d.facts });

  for (const d of docs) {
    const amount = resolvedAmount(d.facts);
    // The engine asks with the FIRST vendor (the merchant it was handed).
    const merchant = d.vendors.length ? vendorKey(d.vendors[0]) : '';
    let original: CopyCandidate | null = null;
    if (amount !== null && merchant) {
      const pool = (byVendor.get(`${d.organizationId}|${merchant}`) ?? []).map(asCandidate);
      original = findOriginal({ id: d.id, uploadedAt: d.uploadedAt, amount }, pool);
    }
    originalOf.set(d.id, original?.id ?? null);

    const reasonBefore = factValue(d, 'decision_reason');
    const decisionBefore = factValue(d, 'decision');
    const reasons = splitReasons(reasonBefore);
    const wasDup = reasons.includes(DUPLICATE_REASON);
    const isDup = original !== null;
    if (wasDup === isDup) continue;

    const unknown = reasons.filter(r => !(r in REASON_DECISION));
    if (unknown.length) {
      refused.push({ id: d.id, why: `unknown reason(s) ${JSON.stringify(unknown)}: the decision cannot be recomputed` });
      continue;
    }
    const nextReasons = isDup ? [...reasons, DUPLICATE_REASON] : reasons.filter(r => r !== DUPLICATE_REASON);
    const decision = nextReasons.reduce<Decision>(
      (acc, r) => (PRIORITY[REASON_DECISION[r]] > PRIORITY[acc] ? REASON_DECISION[r] : acc),
      'APPROVED',
    );
    changes.push({
      id: d.id,
      organizationId: d.organizationId,
      action: isDup ? 'flag' : 'unflag',
      originalId: original?.id ?? null,
      before: { decision: decisionBefore, reason: reasonBefore },
      after: { decision, reason: nextReasons.join(', ') },
    });
  }
  return { changes, refused, originalOf };
}

/** The documents as they would read after the plan is written. */
export function applyPlan(docs: ReevalDoc[], plan: Plan): ReevalDoc[] {
  const byId = new Map(plan.changes.map(c => [c.id, c]));
  return docs.map(d => {
    const c = byId.get(d.id);
    if (!c) return d;
    const base = { valueNumber: null, valueDate: null, currency: null, sourceSpan: 'duplicate_reeval' };
    const facts = d.facts.filter(f => f.key !== 'decision' && f.key !== 'decision_reason');
    facts.push({ key: 'decision', valueString: c.after.decision, ...base });
    if (c.after.reason) facts.push({ key: 'decision_reason', valueString: c.after.reason, ...base });
    return { ...d, facts };
  });
}

/** Rows a kept duplicate: the ledger counts them although they stay flagged. */
export const isKept = (d: ReevalDoc) => factValue(d, 'review_action') === KEEP_ACTION;

/** Rule D's own grouping: organisation, vendor, amount as the ledger reads it. */
export function copyGroupKey(d: ReevalDoc): string | null {
  const amount = resolvedAmount(d.facts);
  if (amount === null || !d.vendors.length) return null;
  return `${d.organizationId}|${vendorKey(d.vendors[0])}|${toMilli(amount)}`;
}
