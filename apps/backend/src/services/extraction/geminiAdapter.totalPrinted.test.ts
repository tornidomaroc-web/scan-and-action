import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
