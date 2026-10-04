import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { GeminiExtractionResult } from '../../types/schemas';
import { INFERRED_TOTAL_CONFIDENCE, INFERRED_TOTAL_SPAN, PRINTED_TOTAL_SPAN, TOTAL_NOT_PRINTED_REASON } from '../totalProvenance';

// ============================================================================
// An inferred total, through the real persistence gate and the real rule engine.
// ============================================================================
// What the owner's 54.50 page should have produced: the figure stored, the
// document NEEDS_REVIEW, and a decision_reason that names the cause. The
// printed shape is the control, and it is today's behaviour byte for byte.
// Same in-memory store as persistence.ruleEngineFacts.test.ts.
// ============================================================================

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';

function makeDb() {
  const state = { docs: new Map<string, any>(), facts: [] as any[] };
  state.docs.set(DOC_ID, { id: DOC_ID, status: 'PROCESSING', scanChargedAt: null, rawText: '', processedAt: null, summary: 'A hardware receipt.' });
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
  return { prisma, facts: () => state.facts, doc: () => state.docs.get(DOC_ID) };
}

/** Exactly what geminiAdapter emits for a page with (printed) or without (inferred) a Total line. */
const extraction = (span: string, confidence: number): GeminiExtractionResult => ({
  detectedLanguage: 'en', documentType: 'Receipt', documentSubtype: 'Professional Intelligence',
  rawText: 'CORNER HARDWARE\nSandwich 32.00\nJuice 22.50\nitem receipt total card payment',
  summary: 'A hardware receipt.', overallConfidence: 0.99,
  facts: [
    { key: 'Date', factType: 'DATE', valueDate: '2026-09-30', sourceSpan: 'Search Strategy: Exhaustive', confidence: 0.99 },
    { key: 'Total Amount', factType: 'AMOUNT', valueNumber: 54.5, currency: 'USD', sourceSpan: span, confidence },
  ],
  entities: [{ name: 'Corner Hardware', entityType: 'VENDOR', role: 'Issuer', sourceSpan: 'Global Metadata', confidence: 0.99 }],
});

function makeService(db: ReturnType<typeof makeDb>) {
  const svc = new PersistenceService(db.prisma);
  (svc as any).entityResolver = { resolveOrGenerateEntity: async () => ({ id: 'ent-1' }) };
  return svc;
}
const persist = (db: ReturnType<typeof makeDb>, e: GeminiExtractionResult) =>
  makeService(db).updateDocumentWithExtraction(DOC_ID, 'user-1', ORG_ID, 'org-1/scan.jpg', 'scan.jpg', e);
const fact = (db: ReturnType<typeof makeDb>, key: string) => db.facts().find((f: any) => f.key === key);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a page with no Total line', () => {
  it('stores the figure as a draft, sends the document to review, and names the cause', async () => {
    const db = makeDb();
    await persist(db, extraction(INFERRED_TOTAL_SPAN, INFERRED_TOTAL_CONFIDENCE));
    expect(db.doc().status).toBe('NEEDS_REVIEW');
    const total = fact(db, 'TOTAL_AMOUNT');
    expect(total).toMatchObject({ valueNumber: 54.5, currency: 'USD', sourceSpan: INFERRED_TOTAL_SPAN, isReviewed: false });
    expect(fact(db, 'decision')?.valueString).toBe('NEEDS_REVIEW');
    expect(fact(db, 'decision_reason')?.valueString).toBe(TOTAL_NOT_PRINTED_REASON);
  });
});

describe('the control: a printed total, today\'s behaviour', () => {
  it('COMPLETED, reviewed, APPROVED with no reason', async () => {
    const db = makeDb();
    await persist(db, extraction(PRINTED_TOTAL_SPAN, 0.99));
    expect(db.doc().status).toBe('COMPLETED');
    expect(fact(db, 'TOTAL_AMOUNT')).toMatchObject({ valueNumber: 54.5, sourceSpan: PRINTED_TOTAL_SPAN, isReviewed: true });
    expect(fact(db, 'decision')?.valueString).toBe('APPROVED');
    expect(fact(db, 'decision_reason')).toBeUndefined();
  });
});
