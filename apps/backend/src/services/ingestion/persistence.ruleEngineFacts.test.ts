import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { RuleEngineService } from '../ruleEngineService';
import { GeminiExtractionResult } from '../../types/schemas';

// ============================================================================
// The rule engine must see the SAME fact keys on ingestion that it sees on
// re-evaluation.
// ============================================================================
// resolveAmount (ruleEngineService.ts:90-99) matches 'manual_amount',
// 'TOTAL_AMOUNT' and 'amount' by EXACT string. Two callers feed it:
//
//   persistence.ts:160-161      allFacts = [...extraction.facts, ...]  -> RAW keys
//   documentController.ts:466-476  updatedDoc.facts (from the DB)      -> CANONICAL keys
//
// geminiAdapter.ts:227 emits the amount with key 'Total Amount'. FACT_KEY_MAP
// (normalizationService.ts:16-28) has 'total' but NOT 'total amount', so the
// canonical 'TOTAL_AMOUNT' stored in the database comes from the uppercase
// fallback at :49 -- applied when WRITING the row, after the raw key has already
// been handed to the rule engine.
//
// Measured consequence in production before this change: 201 of 201
// ingestion-path decisions said "Missing amount", 54 of them on documents that
// demonstrably held an amount. Every one of the 8 re-evaluation-path decisions
// resolved correctly. Zero counter-examples in either direction.
//
// WHY THE EXISTING SUITE MISSED IT: ruleEngineService.test.ts feeds
// `[{ key: 'TOTAL_AMOUNT', ... }]` -- already canonical. It has only ever
// exercised the re-eval path's contract. These tests drive the INGESTION path,
// with the raw key the adapter actually produces.
// ============================================================================

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function makeDb() {
  const state = { docs: new Map<string, any>(), facts: [] as any[], orgs: new Map<string, any>() };
  state.docs.set(DOC_ID, {
    id: DOC_ID, status: 'PROCESSING', scanChargedAt: null,
    rawText: '', processedAt: null, summary: 'An invoice.',
  });
  state.orgs.set(ORG_ID, { id: ORG_ID, plan: 'PRO', scanCount: 0 });

  const tx = {
    document: {
      update: async ({ where, data }: any) => {
        const r = state.docs.get(where.id); Object.assign(r, data); return { ...r };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const r of state.docs.values()) {
          if (where.id !== undefined && r.id !== where.id) continue;
          if (Object.prototype.hasOwnProperty.call(where, 'scanChargedAt') &&
              where.scanChargedAt === null && r.scanChargedAt !== null) continue;
          Object.assign(r, data); count++;
        }
        return { count };
      },
    },
    documentFact: {
      findFirst: async ({ where }: any) =>
        state.facts.find(f => f.documentId === where.documentId && f.key === where.key) ?? null,
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
    // What the REAL RuleEngineService needs: the summary, and the duplicate probe.
    document: {
      findUnique: async () => ({ summary: state.docs.get(DOC_ID).summary }),
      findFirst: async () => null,
    },
  };
  return { prisma, facts: () => state.facts, doc: () => state.docs.get(DOC_ID) };
}

/** An extraction shaped exactly as geminiAdapter.ts:218-235 produces one. */
const extractionWithAmount = (amount: number | null): GeminiExtractionResult => ({
  detectedLanguage: 'en',
  documentType: 'Invoice',
  documentSubtype: 'Professional Intelligence',
  rawText: 'INVOICE\nsubtotal 100.00\ntax 20.00\ntotal 120.00\nitem consulting\npayment card',
  summary: 'A consulting invoice.',
  facts: [
    { key: 'Date', factType: 'DATE', valueDate: '2026-09-01', sourceSpan: 'Search Strategy: Exhaustive', confidence: 0.99 },
    // THE KEY THAT MATTERS: the adapter emits 'Total Amount', not 'TOTAL_AMOUNT'.
    ...(amount === null ? [] : [{
      key: 'Total Amount', factType: 'AMOUNT' as const, valueNumber: amount,
      currency: 'USD', sourceSpan: 'Primary Total', confidence: 0.99,
    }]),
  ] as any,
  entities: [],
  overallConfidence: 0.99,
});

function makeService(db: ReturnType<typeof makeDb>, spy?: (facts: any[]) => void) {
  const svc = new PersistenceService(db.prisma);
  // The REAL rule engine, so resolveAmount is genuinely exercised.
  const real = new RuleEngineService(db.prisma);
  (svc as any).ruleEngine = {
    evaluate: async (docId: string, orgId: string, facts: any[], merchant: string | null) => {
      spy?.(facts);
      return real.evaluate(docId, orgId, facts, merchant);
    },
  };
  return svc;
}

const persist = (svc: PersistenceService, extraction: GeminiExtractionResult) =>
  svc.updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'org-1/inv.jpg', 'inv.jpg', extraction);

const reasonOf = (db: ReturnType<typeof makeDb>) =>
  db.facts().find((f: any) => f.key === 'decision_reason')?.valueString ?? null;
const decisionOf = (db: ReturnType<typeof makeDb>) =>
  db.facts().find((f: any) => f.key === 'decision')?.valueString ?? null;

describe('ingestion hands the rule engine canonical fact keys', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes the CANONICAL key the database stores, not the raw adapter key', async () => {
    const db = makeDb();
    let seen: any[] = [];
    await persist(makeService(db, f => { seen = f; }), extractionWithAmount(120));

    const keys = seen.map(f => f.key);
    expect(keys, 'rule engine received the raw adapter key').toContain('TOTAL_AMOUNT');
    expect(keys).not.toContain('Total Amount');
  });

  // THE 201/201 REPRODUCTION.
  it('does NOT report "Missing amount" for a document that HAS an amount', async () => {
    const db = makeDb();
    await persist(makeService(db), extractionWithAmount(120));

    expect(reasonOf(db) ?? '').not.toContain('Missing amount');
  });

  it('a 120 invoice with no other trigger is APPROVED, not NEEDS_REVIEW', async () => {
    const db = makeDb();
    await persist(makeService(db), extractionWithAmount(120));

    expect(decisionOf(db)).toBe('APPROVED');
  });

  // Rule A has never been reachable on this path either.
  it('an amount over 500 triggers Rule A', async () => {
    const db = makeDb();
    await persist(makeService(db), extractionWithAmount(750));

    expect(reasonOf(db) ?? '').toContain('Amount exceeds threshold');
    expect(decisionOf(db)).toBe('NEEDS_REVIEW');
  });

  // CONTROL: a genuinely amount-less document must still say Missing amount.
  // 147 of the 201 production rows are exactly this case and were always correct.
  it('CONTROL: a document with NO amount still correctly reports "Missing amount"', async () => {
    const db = makeDb();
    await persist(makeService(db), extractionWithAmount(null));

    expect(reasonOf(db) ?? '').toContain('Missing amount');
    expect(decisionOf(db)).toBe('NEEDS_REVIEW');
  });

  it('CONTROL: the canonical key is the same one written to the fact row', async () => {
    // Whatever key the engine is given must be the key the DB ends up holding,
    // or the two paths diverge again the moment either side changes.
    const db = makeDb();
    let seen: any[] = [];
    await persist(makeService(db, f => { seen = f; }), extractionWithAmount(120));

    const stored = db.facts().filter((f: any) => f.factType === 'AMOUNT').map((f: any) => f.key);
    const given = seen.filter(f => f.factType === 'AMOUNT').map(f => f.key);
    expect(given).toEqual(stored);
  });
});
