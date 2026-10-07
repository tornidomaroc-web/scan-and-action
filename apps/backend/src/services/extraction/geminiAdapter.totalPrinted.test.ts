import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GeminiExtractionAdapter } from './geminiAdapter';
import { INFERRED_TOTAL_CONFIDENCE, INFERRED_TOTAL_SPAN, PRINTED_TOTAL_SPAN } from '../totalProvenance';

// ============================================================================
// A total the page never printed leaves the adapter marked as such.
// ============================================================================
// Found on the owner's iPhone test of build 13 (2026-09-30): a page with no
// Total line came back as 54.50, the sum of its items, written at 0.99 as
// 'Primary Total', byte-identical to a printed total. The prompt now asks the
// model for `totalPrinted`, and an explicit `false` lowers the fact below
// persistence's CONFIDENCE_THRESHOLD and names its span (totalProvenance.ts).
// Everything else, including an answer that omits the field, is a printed
// total exactly as before: that is the safe default when the model is silent.
// ============================================================================

let sentPrompt = '';
function adapterAnswering(json: Record<string, unknown>) {
  const adapter = new GeminiExtractionAdapter();
  (adapter as any).genAI = {
    getGenerativeModel: () => ({
      generateContent: async (parts: unknown[]) => {
        sentPrompt = String(parts[0]);
        return { response: { text: () => JSON.stringify(json) } };
      },
    }),
  };
  return adapter;
}
const base = {
  documentType: 'receipt', language: 'en', date: '2026-09-30', totalAmount: 54.5, currency: 'USD',
  merchantName: 'Corner Hardware', rawText: 'Sandwich 32.00\nJuice 22.50', summary: 's', items: [],
};

async function total(answer: Record<string, unknown>) {
  const r = await adapterAnswering({ ...base, ...answer }).extractFromImage(Buffer.from('x'), 'image/jpeg');
  return { fact: r.facts.find(f => f.key === 'Total Amount')!, overall: r.overallConfidence };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('totalPrinted: false', () => {
  it('keeps the figure, marks the span inferred, and puts the fact and the document below the review threshold', async () => {
    const { fact, overall } = await total({ totalPrinted: false });
    expect(fact.valueNumber).toBe(54.5);
    expect(fact.sourceSpan).toBe(INFERRED_TOTAL_SPAN);
    expect(fact.confidence).toBe(INFERRED_TOTAL_CONFIDENCE);
    expect(fact.confidence).toBeLessThan(0.98);
    // (dateScore 0.99 + amountScore 0.6) / 2: the document itself goes to review
    expect(overall).toBeLessThan(0.98);
  });
});

describe('every other answer is a printed total, as before', () => {
  it.each([
    ['true', { totalPrinted: true }],
    ['absent (an older prompt or a partial answer)', {}],
    ['null', { totalPrinted: null }],
    ['the string "false", which is not the boolean', { totalPrinted: 'false' }],
  ])('totalPrinted %s', async (_label, answer) => {
    const { fact, overall } = await total(answer);
    expect(fact.valueNumber).toBe(54.5);
    expect(fact.sourceSpan).toBe(PRINTED_TOTAL_SPAN);
    expect(fact.confidence).toBe(0.99);
    expect(overall).toBe(0.99);
  });
});

describe('the prompt asks for it', () => {
  it('names totalPrinted in the schema and says when it is false', async () => {
    await total({});
    expect(sentPrompt).toContain('"totalPrinted": boolean');
    expect(sentPrompt).toMatch(/totalPrinted to false/);
    expect(sentPrompt).toMatch(/true ONLY when a line such as Total/);
  });

  // The 2026-10-04 run read a printed `總計:1` as "not printed" (c119, a
  // Taiwanese e-invoice). The prompt now lists the labels Moroccan, Arabic,
  // Chinese, Japanese and European receipts actually print. The non-Latin
  // strings are written as code points here, so the assertion is about the
  // bytes in the file and not about what a terminal or an editor renders.
  it.each([
    ['Total TTC', 'Total TTC'],
    ['Montant TTC', 'Montant TTC'],
    ['Net à payer', 'Net à payer'],
    ['المجموع', 'المجموع'],
    ['الإجمالي', 'الإجمالي'],
    ['المبلغ الإجمالي', 'المبلغ الإجمالي'],
    ['صافي المبلغ', 'صافي المبلغ'],
    ['總計', '總計'],
    ['合計', '合計'],
    ['合计', '合计'],
  ])('lists the printed total label %s', async (_label, codePoints) => {
    await total({});
    // As a whole list entry, delimited: `الإجمالي` is also the tail of
    // `المبلغ الإجمالي`, and a bare toContain would let one of the two be wrong.
    const escaped = codePoints.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(sentPrompt).toMatch(new RegExp(`[:,] ${escaped}[,.]`));
  });

  it('says a subtotal line is not the total, naming 小計', async () => {
    await total({});
    expect(sentPrompt).toMatch(/subtotal line .* is not the total/i);
    expect(sentPrompt).toContain('小計');
  });

  it('every label is sound UTF-8 in the source file itself, not only in memory', () => {
    // A mis-saved file (ANSI code page, a stray BOM mid-file) would still load
    // as *some* string; U+FFFD is what a broken byte decodes to.
    const src = readFileSync(join(__dirname, 'geminiAdapter.ts'), 'utf8');
    const line = src.split('\n').find(l => l.includes('Printed total labels include'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('�');
    expect(line).toContain('المجموع');
    expect(line).toContain('總計');
  });
});
