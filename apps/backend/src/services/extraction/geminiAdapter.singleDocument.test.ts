import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiExtractionAdapter } from './geminiAdapter';

// ============================================================================
// The single-document check counts purchases, not pieces of paper.
// ============================================================================
// The 2026-10-04 run refused a Taiwanese e-invoice printed with its own sales
// detail (c083, Gloria Outlets: one purchase, two printed sections) and,
// rightly, a receipt photographed with its card-terminal slip (c004,
// Meinardi). The prompt now says which is which. These tests pin the wording
// and the YES/NO parser around it; whether the model follows the wording is
// a paid measurement (the re-run), not something a test can show.
// ============================================================================

let sentPrompt = '';
function adapterSaying(text: string | Error) {
  const adapter = new GeminiExtractionAdapter();
  (adapter as any).genAI = {
    getGenerativeModel: () => ({
      generateContent: async (parts: unknown[]) => {
        sentPrompt = String(parts[0]);
        if (text instanceof Error) throw text;
        return { response: { text: () => text } };
      },
    }),
  };
  return adapter;
}
const check = (text: string | Error) => adapterSaying(text).isSingleDocument(Buffer.from('x'), 'image/jpeg');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the prompt', () => {
  it('still asks the binary question and demands YES or NO', async () => {
    await check('NO');
    expect(sentPrompt).toContain('more than one distinct document, receipt, or business card?');
    expect(sentPrompt).toContain("Answer ONLY 'YES' or 'NO'.");
  });

  it('calls a receipt with its own detail, stub, continuation or e-invoice QR section ONE document', async () => {
    await check('NO');
    const one = sentPrompt.match(/ONE document: (.*)\n/)![1];
    for (const part of ['itemised detail', 'continuation', 'stub', 'e-invoice', 'QR']) expect(one).toContain(part);
    expect(one).toContain('single purchase');
    expect(sentPrompt).toContain('Count the purchases, not the pieces of paper.');
  });

  it('keeps the card slip and two different purchases as MORE THAN ONE', async () => {
    await check('NO');
    const more = sentPrompt.match(/MORE THAN ONE: (.*)\n/)![1];
    expect(more).toContain('card-terminal slip');
    expect(more).toContain('different purchases');
  });

  it('states the one-document rule before the refusal rule, so a continuation is not read as a second document first', async () => {
    await check('NO');
    expect(sentPrompt.indexOf('ONE document:')).toBeLessThan(sentPrompt.indexOf('MORE THAN ONE:'));
  });
});

describe('the parser around it is unchanged', () => {
  it.each([
    ['NO', true],
    ['no.', true],
    ['YES', false],
    ['Yes, two receipts', false],
    ['YES NO (ambiguous): the safe answer is multiple', false],
    ['(empty)', true],
  ])('%s', async (text, single) => {
    expect(await check(text === '(empty)' ? '' : text)).toBe(single);
  });

  it('fails open on a vendor error', async () => {
    expect(await check(new Error('503'))).toBe(true);
  });
});
