import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { GeminiExtractionResult } from '../../types/schemas';

// ============================================================================
// The category fact: the extractor's answer wins, the keyword matcher is the
// fallback, and the source is written on the fact so the two can be told
// apart. Same in-memory harness shape as persistence.ruleEngineFacts.test.ts.
// ============================================================================
const DOC_ID = 'doc-1', ORG_ID = 'org-1', USER_ID = 'user-1';

function makeDb() {
  const state = { docs: new Map<string, any>(), facts: [] as any[], orgs: new Map<string, any>() };
  state.docs.set(DOC_ID, { id: DOC_ID, status: 'PROCESSING', scanChargedAt: null, rawText: '', processedAt: null, summary: 's' });
  state.orgs.set(ORG_ID, { id: ORG_ID, plan: 'PRO', scanCount: 0 });
  const tx = {
    document: {
      update: async ({ where, data }: any) => { const r = state.docs.get(where.id); Object.assign(r, data); return { ...r }; },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const r of state.docs.values()) {
          if (where.id !== undefined && r.id !== where.id) continue;
          if (Object.prototype.hasOwnProperty.call(where, 'scanChargedAt') && where.scanChargedAt === null && r.scanChargedAt !== null) continue;
          Object.assign(r, data); count++;
        }
        return { count };
      },
    },
    documentFact: {
      findFirst: async ({ where }: any) => state.facts.find(f => f.documentId === where.documentId && f.key === where.key) ?? null,
      create: async ({ data }: any) => { state.facts.push({ ...data }); return { ...data }; },
      deleteMany: async ({ where }: any) => {
        const keys: string[] = where.key?.in ?? [];
        const before = state.facts.length;
        state.facts = state.facts.filter(f => !(f.documentId === where.documentId && keys.includes(f.key)));
        return { count: before - state.facts.length };
      },
    },
    documentEntity: { create: async ({ data }: any) => ({ ...data }) },
    organization: { update: async ({ where }: any) => ({ ...state.orgs.get(where.id) }) },
  };
  const prisma: any = {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
    document: { findUnique: async () => ({ summary: 's' }), findFirst: async () => null },
  };
  return { prisma, facts: () => state.facts };
}

function extraction(rawText: string, category: string | null | undefined, merchant = 'Green Basket Market'): GeminiExtractionResult & { category?: string | null } {
  return {
    detectedLanguage: 'en', documentType: 'receipt', documentSubtype: 'x', rawText, summary: 's',
    facts: [
      { key: 'Date', factType: 'DATE', valueDate: '2026-09-19', sourceSpan: 'Search Strategy: Exhaustive', confidence: 0.99 },
      { key: 'Total Amount', factType: 'AMOUNT', valueNumber: 42.76, currency: 'USD', sourceSpan: 'Primary Total', confidence: 0.99 },
    ] as any,
    entities: [{ name: merchant, entityType: 'VENDOR', role: 'Issuer', sourceSpan: 'Global Metadata', confidence: 0.99 }] as any,
    overallConfidence: 0.99,
    ...(category === undefined ? {} : { category }),
  };
}

function makeService(db: ReturnType<typeof makeDb>) {
  const svc = new PersistenceService(db.prisma);
  (svc as any).ruleEngine = { evaluate: async () => ({ decision: 'APPROVED', reason: 'ok', rulesFired: [] }) };
  (svc as any).entityResolver = { resolveOrGenerateEntity: async () => ({ id: 'e1' }) };
  return svc;
}
const categoryFact = (db: ReturnType<typeof makeDb>) => db.facts().find((f: any) => f.key === 'category');
const GROCERY = 'GREEN BASKET MARKET\nSourdough bread 4.50\nMilk 3.99\nSUBTOTAL 39.50\nTAX 3.26\nTOTAL 42.76';

describe('the category fact: extractor first, keywords as fallback', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('writes the extractor category with source "extractor"', async () => {
    const db = makeDb();
    await makeService(db).updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'k', 'f.jpg', extraction(GROCERY, 'Food'));
    const f = categoryFact(db);
    expect(f?.valueString).toBe('Food');
    expect(f?.sourceSpan).toBe('extractor');
  });

  it('falls back to the keyword matcher, with its own source, when the extractor said nothing', async () => {
    const db = makeDb();
    await makeService(db).updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'k', 'f.jpg', extraction(GROCERY, null));
    const f = categoryFact(db);
    expect(f?.sourceSpan).toBe('auto_categorization');
    expect(f?.valueString).toBe('Food'); // 'market' is a keyword
  });

  it('CONTROL: without the extractor, a receipt with no keyword is Other; with it, the extractor decides', async () => {
    const text = 'مخبزة الأمل\nخبز بلدي 8.00\nالمجموع 86.50 درهم';
    const a = makeDb();
    await makeService(a).updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'k', 'f.jpg', extraction(text, undefined, 'مخبزة الأمل'));
    expect(categoryFact(a)?.valueString).toBe('Other');
    const b = makeDb();
    await makeService(b).updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'k', 'f.jpg', extraction(text, 'Food', 'مخبزة الأمل'));
    expect(categoryFact(b)?.valueString).toBe('Food');
  });
});
