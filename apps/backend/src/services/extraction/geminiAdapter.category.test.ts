import { describe, it, expect } from 'vitest';
import { GeminiExtractionAdapter } from './geminiAdapter';

// The extraction JSON now carries `category`. These pin the transport: the
// value rides beside the schema-parsed result (like modelVersion), is
// normalized onto the enum, and is null, not Other, when the model strays.
function adapterAnswering(json: Record<string, unknown>) {
  const adapter = new GeminiExtractionAdapter();
  (adapter as any).genAI = {
    getGenerativeModel: () => ({ generateContent: async () => ({ response: { text: () => JSON.stringify(json) } }) }),
  };
  return adapter;
}
const base = { documentType: 'receipt', language: 'en', date: '2026-09-19', totalAmount: 42.76, currency: 'USD', merchantName: 'Green Basket Market', rawText: 'GREEN BASKET MARKET SUBTOTAL 39.50 TOTAL 42.76', summary: 's', items: [] };

describe('geminiAdapter: category rides with the extraction', () => {
  it('the prompt asks for the category enum', async () => {
    const adapter = new GeminiExtractionAdapter();
    let seen = '';
    (adapter as any).genAI = { getGenerativeModel: () => ({ generateContent: async (parts: any[]) => { seen = String(parts[0]); return { response: { text: () => JSON.stringify(base) } }; } }) };
    await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg');
    expect(seen).toContain('"category"');
    expect(seen).toContain('FOOD');
    expect(seen).toContain('OTHER');
  });

  it('a listed answer is normalized onto the stored label', async () => {
    const r = await adapterAnswering({ ...base, category: 'FOOD' }).extractFromImage(Buffer.from('x'), 'image/jpeg');
    expect(r.category).toBe('Food');
    expect(r.documentType).toBe('receipt');
  });

  it('an unlisted or missing answer is null, so persistence falls back to keywords', async () => {
    expect((await adapterAnswering({ ...base, category: 'GROCERIES' }).extractFromImage(Buffer.from('x'), 'image/jpeg')).category).toBeNull();
    expect((await adapterAnswering({ ...base }).extractFromImage(Buffer.from('x'), 'image/jpeg')).category).toBeNull();
  });
});
