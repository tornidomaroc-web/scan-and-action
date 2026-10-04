import { describe, it, expect } from 'vitest';
import { RuleEngineService } from './ruleEngineService';
import { INFERRED_TOTAL_SPAN, PRINTED_TOTAL_SPAN, TOTAL_NOT_PRINTED_REASON } from './totalProvenance';

// ============================================================================
// Rule E: a total the page never printed sends the document to review, named.
// ============================================================================
// The fact carries its provenance in sourceSpan (totalProvenance.ts). The rule
// reads it on both paths the engine serves: ingestion (the adapter's raw facts,
// which carry sourceSpan) and re-evaluation (stored rows, which carry the
// column). It stands down once the owner has settled the figure: a typed
// correction or a "keep this amount".
// ============================================================================

function makePrisma() {
  return {
    document: { findUnique: async () => ({ summary: null }), findMany: async () => [] },
  } as any;
}
const engine = () => new RuleEngineService(makePrisma());

const inferred = { key: 'TOTAL_AMOUNT', valueNumber: 54.5, sourceSpan: INFERRED_TOTAL_SPAN };
const printed = { key: 'TOTAL_AMOUNT', valueNumber: 54.5, sourceSpan: PRINTED_TOTAL_SPAN };

describe('Rule E fires on an inferred total', () => {
  it('NEEDS_REVIEW with "Total not printed", and the amount still resolves (no "Missing amount")', async () => {
    const r = await engine().evaluate('d1', 'org', [inferred], 'Corner Hardware');
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.reasons).toEqual([TOTAL_NOT_PRINTED_REASON]);
  });

  it('the reason is the one the client translates (DecisionBanner.REASON_LABEL_KEY)', () => {
    expect(TOTAL_NOT_PRINTED_REASON).toBe('Total not printed');
  });

  it('stacks with a higher-priority rule: an inferred food total over 50 is FLAGGED and still named', async () => {
    const r = await engine().evaluate('d2', 'org', [inferred], 'Pizza Corner');
    expect(r.decision).toBe('FLAGGED');
    expect(r.reasons).toContain('High food expense');
    expect(r.reasons).toContain(TOTAL_NOT_PRINTED_REASON);
  });
});

describe('Rule E stands down', () => {
  it('on a printed total: APPROVED, no reason (every existing row reads this way)', async () => {
    const r = await engine().evaluate('d3', 'org', [printed], 'Corner Hardware');
    expect(r.decision).toBe('APPROVED');
    expect(r.reasons).toEqual([]);
  });

  it('on a total with no span at all (the older test fixtures and any writer that forgets): a printed total', async () => {
    const r = await engine().evaluate('d4', 'org', [{ key: 'TOTAL_AMOUNT', valueNumber: 54.5 }], 'Corner Hardware');
    expect(r.reasons).not.toContain(TOTAL_NOT_PRINTED_REASON);
  });

  it('once the owner typed the printed amount (manual_amount): the correction is the figure', async () => {
    const r = await engine().evaluate('d5', 'org', [inferred, { key: 'manual_amount', valueNumber: 59.95, sourceSpan: 'user_correction' }], 'Corner Hardware');
    expect(r.decision).toBe('APPROVED');
    expect(r.reasons).not.toContain(TOTAL_NOT_PRINTED_REASON);
  });

  it('once the owner kept the amount (review_action marked_valid)', async () => {
    const r = await engine().evaluate('d6', 'org', [inferred, { key: 'review_action', valueString: 'marked_valid', sourceSpan: 'review_flow' }], 'Corner Hardware');
    expect(r.reasons).not.toContain(TOTAL_NOT_PRINTED_REASON);
  });

  it('but NOT on a different review action (a note alone settles nothing)', async () => {
    const r = await engine().evaluate('d7', 'org', [inferred, { key: 'review_action', valueString: 'note_added', sourceSpan: 'review_flow' }], 'Corner Hardware');
    expect(r.reasons).toContain(TOTAL_NOT_PRINTED_REASON);
  });
});
