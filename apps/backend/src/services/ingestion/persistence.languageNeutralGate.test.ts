import { describe, it, expect, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { GeminiExtractionResult } from '../../types/schemas';

// ============================================================================
// The review gate judges the READ, never the language of the page.
// ============================================================================
// Measured 2026-10-04 on production 2371c9bd over 56 clean real receipts
// (WORK-QUEUE.md, "the Step 3 measurement"): 43 landed in "Needs review" only
// because their text held fewer than two of thirteen ENGLISH words, and 3 more
// because "subtotal", "total" or "tax" appeared twice on one receipt. Every one
// of those 46 was read correctly. This file holds the gate to the conditions
// that are about the extraction itself: confidence, the two core facts, a
// template word, and the per-fact confidence.
//
// Same in-memory store as persistence.inferredTotal.test.ts.
// ============================================================================

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';

function makeDb() {
  const state = { docs: new Map<string, any>(), facts: [] as any[] };
  state.docs.set(DOC_ID, { id: DOC_ID, status: 'PROCESSING', scanChargedAt: null, rawText: '', processedAt: null, summary: 'A receipt.' });
  const tx = {
    document: {
      update: async ({ where, data }: any) => { const r = state.docs.get(where.id); Object.assign(r, data); return { ...r }; },
      updateMany: async ({ where, data }: any) => {
        const r = state.docs.get(where.id);
        if (where.scanChargedAt === null && r.scanChargedAt !== null) return { count: 0 };
        Object.assign(r, data); return { count: 1 };
      },
    },
    documentFact: {
      findFirst: async ({ where }: any) => state.facts.find(f => f.documentId === where.documentId && f.key === where.key) ?? null,
      create: async ({ data }: any) => { state.facts.push({ ...data }); return { ...data }; },
      deleteMany: async ({ where }: any) => {
        const keys: string[] = where.key?.in ?? [];
        state.facts = state.facts.filter(f => !(f.documentId === where.documentId && keys.includes(f.key)));
        return { count: 0 };
      },
    },
    documentEntity: { create: async ({ data }: any) => ({ ...data }) },
    organization: { update: async () => ({ id: ORG_ID, plan: 'PRO', scanCount: 1 }) },
  };
  const prisma: any = {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
    document: { findUnique: async () => ({ summary: state.docs.get(DOC_ID).summary, uploadedAt: new Date() }), findFirst: async () => null, findMany: async () => [] },
  };
  return { prisma, doc: () => state.docs.get(DOC_ID) };
}

/** A clean read: both core facts at 0.99, overall 0.99, a printed total. Only the page text varies. */
const cleanRead = (rawText: string, overrides: Partial<GeminiExtractionResult> = {}): GeminiExtractionResult => ({
  detectedLanguage: 'ar', documentType: 'Receipt', documentSubtype: 'Professional Intelligence',
  rawText, summary: 'A receipt.', overallConfidence: 0.99,
  facts: [
    { key: 'Date', factType: 'DATE', valueDate: '2026-10-01', sourceSpan: 'Search Strategy: Exhaustive', confidence: 0.99 },
    { key: 'Total Amount', factType: 'AMOUNT', valueNumber: 85, currency: 'MAD', sourceSpan: 'Printed Total', confidence: 0.99 },
  ],
  entities: [{ name: 'مقهى الأمل', entityType: 'VENDOR', role: 'Issuer', sourceSpan: 'Global Metadata', confidence: 0.99 }],
  ...overrides,
});

async function statusAfter(e: GeminiExtractionResult): Promise<string> {
  const db = makeDb();
  const svc = new PersistenceService(db.prisma);
  (svc as any).entityResolver = { resolveOrGenerateEntity: async () => ({ id: 'ent-1' }) };
  await svc.updateDocumentWithExtraction(DOC_ID, 'user-1', ORG_ID, 'org-1/scan.jpg', 'scan.jpg', e);
  return db.doc().status;
}

vi.spyOn(console, 'log').mockImplementation(() => {});

describe('the review gate judges the read, not the language', () => {
  // Each of these fails on the gate as it stood at 2371c9bd: the text holds
  // fewer than two of the English anchor words.
  it('a receipt printed only in Arabic, read cleanly, is Processed', async () => {
    const text = 'مقهى الأمل\nشارع الحسن الثاني، الدار البيضاء\n2026-10-01\nقهوة 25.00\nكرواسون 30.00\nعصير 30.00\nالمجموع 85.00\nشكرا لزيارتكم';
    expect(await statusAfter(cleanRead(text))).toBe('COMPLETED');
  });

  it('a receipt printed only in Chinese, read cleanly, is Processed', async () => {
    const text = '新宇科技服務(股)公司\n電子發票證明聯\n2026-10-01 12:30\n隨機碼:6872\n總計:85\n賣方:25136736';
    expect(await statusAfter(cleanRead(text, { detectedLanguage: 'zh' }))).toBe('COMPLETED');
  });

  it('a French receipt whose only English-looking word is "total" is Processed', async () => {
    const text = 'BOULANGERIE DU PORT\n12 rue de la Mer\n01/10/2026\nBaguette 1,20\nCroissant 1,30\nTotal 2,50\nEspèces\nMerci de votre visite';
    expect(await statusAfter(cleanRead(text, { detectedLanguage: 'fr' }))).toBe('COMPLETED');
  });

  // These two fail on 2371c9bd through the repeated-marker heuristic: a word
  // printed twice on one receipt was read as a sign of a second receipt.
  it('one receipt printing Subtotal, Total and Tax twice each is Processed', async () => {
    const text = 'CABANA STORE\n2026-10-01\nShirt 40.00\nSubtotal 40.00\nTax 5.00\nTotal 45.00\nCard\nSubtotal 40.00 Tax 5.00 Total 45.00\nThank you';
    expect(await statusAfter(cleanRead(text, { detectedLanguage: 'en' }))).toBe('COMPLETED');
  });

  it('one receipt saying "receipt" twice and "total" twice is Processed', async () => {
    const text = 'T.K.MAXX\nSALE RECEIPT\n2026-10-01\nJacket 60.00\nSubtotal 60.00\nTotal 60.00\nKeep this receipt for returns';
    expect(await statusAfter(cleanRead(text, { detectedLanguage: 'en' }))).toBe('COMPLETED');
  });
});

describe('the conditions about the read itself still send a page to review', () => {
  const arabic = 'مقهى الأمل\n2026-10-01\nقهوة 25.00\nالمجموع 85.00';

  it('a template word', async () => {
    expect(await statusAfter(cleanRead(arabic + '\nYOUR BUSINESS NAME'))).toBe('NEEDS_REVIEW');
  });

  it('no date read', async () => {
    const e = cleanRead(arabic);
    e.facts = e.facts.filter(f => f.factType !== 'DATE');
    expect(await statusAfter(e)).toBe('NEEDS_REVIEW');
  });

  it('no amount read', async () => {
    const e = cleanRead(arabic);
    e.facts = e.facts.filter(f => f.factType !== 'AMOUNT');
    expect(await statusAfter(e)).toBe('NEEDS_REVIEW');
  });

  it('an empty extraction', async () => {
    expect(await statusAfter(cleanRead('', { facts: [], entities: [], overallConfidence: 0 }))).toBe('NEEDS_REVIEW');
  });

  it('overall confidence below the threshold', async () => {
    expect(await statusAfter(cleanRead(arabic, { overallConfidence: 0.9 }))).toBe('NEEDS_REVIEW');
  });

  it('one fact below the threshold', async () => {
    const e = cleanRead(arabic);
    e.facts[1] = { ...e.facts[1], confidence: 0.6 };
    expect(await statusAfter(e)).toBe('NEEDS_REVIEW');
  });
});
