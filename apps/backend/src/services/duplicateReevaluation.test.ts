import { describe, it, expect } from 'vitest';
import { applyPlan, planDuplicateReevaluation, ReevalDoc } from './duplicateReevaluation';
import { buildLedger, LedgerFactInput } from './ledger/ledgerCore';

// The one-off re-evaluation runs the DUPLICATE RULE ONLY and writes decision
// facts only. These pin what it may and may not touch.

const f = (key: string, p: Partial<LedgerFactInput> = {}): LedgerFactInput => ({
  key, valueString: null, valueNumber: null, valueDate: null, currency: null, sourceSpan: 'fixture', ...p,
});

function d(id: string, at: string, o: { status?: string; amount?: number; vendor?: string; decision?: string; reason?: string; kept?: boolean; date?: string } = {}): ReevalDoc {
  const facts: LedgerFactInput[] = [];
  if (o.amount !== undefined) facts.push(f('TOTAL_AMOUNT', { valueNumber: o.amount, currency: 'MAD' }));
  if (o.decision) facts.push(f('decision', { valueString: o.decision }));
  if (o.reason) facts.push(f('decision_reason', { valueString: o.reason }));
  if (o.kept) facts.push(f('review_action', { valueString: 'marked_valid' }));
  facts.push(f('TRANSACTION_DATE', { valueDate: new Date(`${o.date ?? '2026-02-25'}T00:00:00Z`) }));
  return { id, organizationId: 'org', status: o.status ?? 'COMPLETED', uploadedAt: new Date(at), vendors: o.vendor === '' ? [] : [o.vendor ?? 'BIM MAROC'], facts };
}

describe('planDuplicateReevaluation', () => {
  it('never-evaluated copies: the first stays untouched, the later ones get a duplicate decision and nothing else', () => {
    const docs = [d('a', '2026-03-27T14:27:00Z', { amount: 467.85 }), d('b', '2026-03-27T14:58:00Z', { amount: 467.85 }), d('c', '2026-03-27T15:00:00Z', { amount: 467.85 })];
    const plan = planDuplicateReevaluation(docs);
    expect(plan.changes.map(c => [c.id, c.action, c.before.decision, c.after.decision, c.after.reason, c.originalId])).toEqual([
      ['b', 'flag', null, 'FLAGGED', 'Possible duplicate expense', 'a'],
      ['c', 'flag', null, 'FLAGGED', 'Possible duplicate expense', 'a'],
    ]);
    // No Rule A/B/C: a never-evaluated row that is not a copy gets no decision at all.
    expect(plan.changes.find(c => c.id === 'a')).toBeUndefined();
  });

  it('a flagged first copy is unflagged, and its decision is recomputed from the reasons that remain', () => {
    const docs = [
      d('first', '2026-09-08T18:03:00Z', { amount: 1141.55, decision: 'FLAGGED', reason: 'Amount exceeds threshold, Possible duplicate expense' }),
      d('second', '2026-09-09T00:41:00Z', { amount: 1141.55, decision: 'NEEDS_REVIEW', reason: 'Amount exceeds threshold' }),
      d('solo', '2026-09-09T00:42:00Z', { amount: 5, vendor: 'OTHER', decision: 'FLAGGED', reason: 'Possible duplicate expense' }),
    ];
    const plan = planDuplicateReevaluation(docs);
    expect(plan.changes.map(c => [c.id, c.action, c.after.decision, c.after.reason])).toEqual([
      ['first', 'unflag', 'NEEDS_REVIEW', 'Amount exceeds threshold'],
      ['second', 'flag', 'FLAGGED', 'Amount exceeds threshold, Possible duplicate expense'],
      ['solo', 'unflag', 'APPROVED', ''],
    ]);
  });

  it('a kept copy keeps its keep and stays counted; status is never part of a change', () => {
    const docs = [
      d('a', '2026-01-01T00:00:00Z', { amount: 30 }),
      d('k', '2026-01-02T00:00:00Z', { amount: 30, decision: 'FLAGGED', reason: 'Possible duplicate expense', kept: true }),
    ];
    const plan = planDuplicateReevaluation(docs);
    expect(plan.changes).toEqual([]); // k is already a flagged later copy
    const after = applyPlan(docs, plan);
    expect(after.find(x => x.id === 'k')!.facts.find(x => x.key === 'review_action')!.valueString).toBe('marked_valid');
    const ledger = buildLedger(after.map(x => ({ id: x.id, status: x.status, uploadedAt: x.uploadedAt, merchant: null, facts: x.facts })), '2026-02', 'UTC');
    expect(ledger.currencies[0].receipts.map(r => r.documentId)).toEqual(['a', 'k']);
    for (const c of planDuplicateReevaluation([...docs, d('z', '2026-01-03T00:00:00Z', { amount: 30, status: 'NEEDS_REVIEW' })]).changes) {
      expect(Object.keys(c).sort()).toEqual(['action', 'after', 'before', 'id', 'organizationId', 'originalId']);
    }
  });

  it('refuses a row whose reasons it cannot map, rather than guess its decision', () => {
    const docs = [d('a', '2026-01-01T00:00:00Z', { amount: 9 }), d('b', '2026-01-02T00:00:00Z', { amount: 9, decision: 'NEEDS_REVIEW', reason: 'Something new' })];
    const plan = planDuplicateReevaluation(docs);
    expect(plan.changes).toEqual([]);
    expect(plan.refused.map(r => r.id)).toEqual(['b']);
  });

  it('a row with no vendor or no amount is never a copy and never an original', () => {
    const docs = [d('a', '2026-01-01T00:00:00Z', { amount: 9, vendor: '' }), d('b', '2026-01-02T00:00:00Z', { amount: 9, vendor: '' }), d('c', '2026-01-03T00:00:00Z', {})];
    expect(planDuplicateReevaluation(docs).changes).toEqual([]);
  });

  it('applyPlan rewrites decision facts only, with the re-evaluation source', () => {
    const docs = [d('a', '2026-01-01T00:00:00Z', { amount: 9 }), d('b', '2026-01-02T00:00:00Z', { amount: 9 })];
    const after = applyPlan(docs, planDuplicateReevaluation(docs));
    const b0 = docs[1].facts.filter(x => x.key !== 'decision' && x.key !== 'decision_reason');
    const b1 = after[1].facts.filter(x => x.key !== 'decision' && x.key !== 'decision_reason');
    expect(b1).toEqual(b0);
    expect(after[1].facts.filter(x => x.key.startsWith('decision')).map(x => [x.key, x.valueString, x.sourceSpan])).toEqual([
      ['decision', 'FLAGGED', 'duplicate_reeval'],
      ['decision_reason', 'Possible duplicate expense', 'duplicate_reeval'],
    ]);
    expect(after[0]).toBe(docs[0]);
  });
});
