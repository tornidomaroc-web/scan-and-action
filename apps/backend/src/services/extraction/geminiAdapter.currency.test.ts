import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiExtractionAdapter } from './geminiAdapter';
import { NormalizationService } from '../normalization/normalizationService';

// What the model answers for `currency`, through the whole adapter and the
// normalizer persistence applies, to the value stored on TOTAL_AMOUNT. The
// same file runs against main (4b4987e): see the PR for where it differs.
function adapterAnswering(json: Record<string, unknown>) {
  const adapter = new GeminiExtractionAdapter();
  (adapter as any).genAI = {
    getGenerativeModel: () => ({ generateContent: async () => ({ response: { text: () => JSON.stringify(json) } }) }),
  };
  return adapter;
}
const base = { documentType: 'receipt', language: 'en', date: '2025-05-21', totalAmount: 290, merchantName: 'Flame Kitchen Restaurant', rawText: 'Grand Total : Rs 290.00', summary: 's', items: [] };

/** The TOTAL_AMOUNT currency as persistence would store it (null = none). */
async function stored(currency: unknown): Promise<{ currency: string | null; amount: number | undefined }> {
  const r = await adapterAnswering({ ...base, currency }).extractFromImage(Buffer.from('x'), 'image/jpeg');
  const total = r.facts.find(f => f.key === 'Total Amount');
  return { currency: new NormalizationService().normalizeCurrency(total?.currency) ?? null, amount: total?.valueNumber };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a symbol that names one currency is stored as its code', () => {
  it.each([
    ['₹', 'INR'],
    ['د.م.', 'MAD'],
    ['د.م', 'MAD'],
    ['د.إ', 'AED'],
    ['ر.س', 'SAR'],
    ['C$', 'CAD'],
    ['A$', 'AUD'],
  ])('%s is stored as %s', async (answer, code) => {
    expect((await stored(answer)).currency).toBe(code);
  });

  it('an ISO code in any case is kept, and the old mappings stand (€, £, DH)', async () => {
    expect((await stored('inr')).currency).toBe('INR');
    expect((await stored('CAD')).currency).toBe('CAD');
    expect((await stored('€')).currency).toBe('EUR');
    expect((await stored('£')).currency).toBe('GBP');
    expect((await stored('DH')).currency).toBe('MAD');
  });
});

describe('an answer that names no one currency is stored as none, never as USD', () => {
  it.each([
    ['Rs', 'shared by INR, PKR, LKR, NPR and MUR'],
    ['Rs.', 'the same, with its dot'],
    ['¥', 'JPY or CNY'],
    ['UNKNOWN', 'the model saying it could not tell'],
    ['TVA', 'a 3-letter word that is not an ISO code'],
    ['', 'an empty answer'],
  ])('%s (%s)', async (answer) => {
    expect((await stored(answer)).currency).toBeNull();
  });

  it('no currency in the answer at all: none is stored, and the amount survives the schema parse', async () => {
    // A null here would fail the optional-string schema and the adapter's own
    // catch would return an EMPTY extraction: the amount is the proof it did not.
    expect(await stored(null)).toEqual({ currency: null, amount: 290 });
    expect(await stored(undefined)).toEqual({ currency: null, amount: 290 });
  });
});

describe('a bare $ keeps its USD reading in this change', () => {
  it('$ is stored as USD, as before: storing it as none waits for a measured prompt change (board: "A bare $ is stored as USD")', async () => {
    expect((await stored('$')).currency).toBe('USD');
    expect((await stored('USD')).currency).toBe('USD');
  });
});
