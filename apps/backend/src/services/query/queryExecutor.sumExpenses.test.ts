import { describe, it, expect, vi } from 'vitest';
import { QueryExecutor } from './queryExecutor';
import { buildLedger, LedgerFactInput } from '../ledger/ledgerCore';

// ============================================================================
// The ask path's spend answer follows the ledger's rules (board item (f)).
// The double returns rows the old sum got wrong: a REJECTED receipt, a flagged
// duplicate, a correction, and a currency stored in the wrong case. The
// expected figures come from buildLedger on the same rows, not from a hand
// sum, since "equals the ledger" is the claim.
// ============================================================================

const f = (key: string, p: Partial<LedgerFactInput>): LedgerFactInput => ({
  key, valueString: null, valueNumber: null, valueDate: null, currency: null, sourceSpan: 'fixture', ...p,
});
const SEP = new Date('2026-09-10T00:00:00Z');
const ROWS = [
  { id: 'ok', status: 'COMPLETED', uploadedAt: SEP, facts: [f('TOTAL_AMOUNT', { valueNumber: 100, currency: 'USD' }), f('TRANSACTION_DATE', { valueDate: SEP })] },
  { id: 'rejected', status: 'REJECTED', uploadedAt: SEP, facts: [f('TOTAL_AMOUNT', { valueNumber: 999, currency: 'USD' }), f('TRANSACTION_DATE', { valueDate: SEP })] },
  { id: 'dup', status: 'COMPLETED', uploadedAt: SEP, facts: [f('TOTAL_AMOUNT', { valueNumber: 100, currency: 'USD' }), f('decision_reason', { valueString: 'Possible duplicate expense' }), f('TRANSACTION_DATE', { valueDate: SEP })] },
  { id: 'corrected', status: 'COMPLETED', uploadedAt: SEP, facts: [f('TOTAL_AMOUNT', { valueNumber: 71.11, currency: 'usd' }), f('manual_amount', { valueNumber: 85 }), f('TRANSACTION_DATE', { valueDate: SEP })] },
  { id: 'unknown', status: 'COMPLETED', uploadedAt: SEP, facts: [f('TOTAL_AMOUNT', { valueNumber: 5, currency: 'UNKNOWN' }), f('TRANSACTION_DATE', { valueDate: SEP })] },
];

const groupBy = vi.fn();
const findMany = vi.fn().mockResolvedValue(ROWS);
const prisma: any = {
  document: { findMany, count: vi.fn() },
  documentFact: { groupBy, findMany: vi.fn() },
  queryLog: { create: vi.fn().mockResolvedValue({}) },
};

describe('sum_expenses', () => {
  it('answers with the ledger totals per currency, and never reaches for a groupBy', async () => {
    const result = await new QueryExecutor(prisma).execute('u', 'org-1', 'total spend', 'en',
      { intent: 'sum_expenses', outputFormat: 'short_answer', confidence: 1, needsClarification: false } as any,
      { sourceTables: ['Document'], joins: [], filters: [], outputMode: 'short_answer' } as any);
    const ledger = buildLedger(ROWS.map(r => ({ ...r, merchant: null })), '2026-09', 'UTC');
    const expected = ledger.currencies.map(c => ({ currency: c.currency ?? 'UNKNOWN', sum: c.total }));
    expect(expected).toEqual([{ currency: 'USD', sum: 185 }, { currency: 'UNKNOWN', sum: 5 }]); // 100 + 85; not 999, not the duplicate
    expect(result.data).toEqual(expect.arrayContaining(expected));
    expect(result.data).toHaveLength(expected.length);
    expect(result.metadata?.isMixedCurrency).toBe(true);
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where.organizationId).toBe('org-1');
  });
});
