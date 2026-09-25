import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentParserService } from './intentParser';
import { QueryPlanner } from './queryPlanner';
import { QueryExecutor } from './queryExecutor';
import { AnswerFormatter } from './answerFormatter';

// A "by category" / "by vendor" question is asked back, never answered with a
// different question's figure. Driven through the real parser, planner,
// executor and formatter; only the database is a double, and it would answer
// a sum if one were asked for, so a clarification here is the pipeline's
// choice and not an empty database.

const db = {
  document: { findMany: vi.fn(), count: vi.fn() },
  documentFact: { groupBy: vi.fn(), findMany: vi.fn() },
  documentEntity: { findMany: vi.fn() },
  queryLog: { create: vi.fn() },
};

async function ask(q: string, lang = 'en') {
  const intent = await new IntentParserService().parseUserQuery(q, lang);
  const plan = new QueryPlanner().generatePlan(intent);
  const result = await new QueryExecutor(db as any).execute('u', 'org', q, lang, intent, plan);
  return new AnswerFormatter().formatAnswer(result);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  db.documentFact.groupBy.mockReset().mockResolvedValue([]);
  // Since 2026-09-25 the total is read through the ledger's judge: one counted
  // row of 1234.5 USD (a fact-less row would be a document with no amount).
  db.document.findMany.mockReset().mockResolvedValue([{ id: 'd1', status: 'COMPLETED', uploadedAt: new Date('2026-09-10T00:00:00Z'), facts: [{ key: 'TOTAL_AMOUNT', valueString: null, valueNumber: 1234.5, valueDate: null, currency: 'USD', sourceSpan: 'x' }] }]);
  db.document.count.mockReset().mockResolvedValue(7);
  db.queryLog.create.mockReset().mockResolvedValue({});
});

describe('grouping questions in search', () => {
  it.each([
    ['how much did I spend by category', 'en'],
    ['expenses per category', 'en'],
    ['invoices by vendor', 'en'],
    ['total per vendor', 'en'],
    ['dépenses par catégorie', 'fr'],
    ['combien par fournisseur', 'fr'],
    ['مصاريفي حسب الفئة', 'ar'],
    ['الفواتير حسب المورد', 'ar'],
  ])('%s is asked back in its own language, and nothing is summed or listed', async (q, lang) => {
    const out = await ask(q, lang);
    expect(out.payload).toEqual({ message: 'CLARIFICATION_REQUIRED' });
    expect(typeof out.answerText).toBe('string');
    expect(out.answerText.length).toBeGreaterThan(10);
    expect(db.documentFact.groupBy).not.toHaveBeenCalled();
    expect(db.document.findMany).not.toHaveBeenCalled();
  });

  it('control: the same question without the grouping words is answered with the total', async () => {
    const out = await ask('how much did I spend');
    expect(out.answerText).toBe('You have spent a total of 1234.50 USD.');
    expect(db.document.findMany).toHaveBeenCalledTimes(1);
    expect(db.documentFact.groupBy).not.toHaveBeenCalled();
  });
});
