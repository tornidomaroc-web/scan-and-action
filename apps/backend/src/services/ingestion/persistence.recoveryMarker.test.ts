import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { GeminiExtractionResult } from '../../types/schemas';

// ============================================================================
// THE OUTCOME MARKER, and why the absence of an error row is not a success.
// ============================================================================
// `extraction_error` says "the vendor call failed". It is deleted ONLY by
// recordExtractionFailure, which fires ONLY on failure. So a SUCCESSFUL
// re-extraction leaves the previous failure's row untouched, and the document
// ends up COMPLETED, full of content, still carrying RATE_LIMITED.
//
// Measured on production 2026-09-09: 19 documents were recovered by the
// re-extraction endpoint and every one of them kept its stale error row. The
// canonical metric written into this file's own comment block — "documents with
// no extraction_error row" — therefore under-counts successes by exactly the
// number of rows recovered, and the error grows every time recovery works.
//
// TWO CHANGES, and the second is the one that matters:
//   1. an OUTCOME MARKER (`extraction_recovered`) recording that a document
//      which HAD failed then succeeded, carrying the class it failed with, so
//      the history survives without clearing the original row;
//   2. the METRIC itself moves to the Document columns — `rawText !== ''` AND
//      `overallConfidence > 0` — which are always current and need no ordering.
//
// THE ORDERING PROBLEM IS WHY THE MARKER CANNOT BE THE METRIC. DocumentFact
// carries no timestamp. If a recovered document later fails again, an
// `extraction_recovered` row and an `extraction_error` row would both exist
// with no way to tell which came last. So recordExtractionFailure deletes the
// marker as it writes the failure: the two keys can never both be current.
// ============================================================================

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

// REQUIRED columns of DocumentFact per schema.prisma. The double enforces them,
// because a double that accepts a create missing `sourceSpan` cannot see the
// bug that made auto-categorization inert for its entire life (PR #188).
const REQUIRED_FACT_COLUMNS = ['documentId', 'factType', 'key', 'confidence', 'sourceSpan'];

function makeDb() {
  const facts: any[] = [];

  const factApi = {
    create: vi.fn(async ({ data }: any) => {
      for (const col of REQUIRED_FACT_COLUMNS) {
        if (data[col] === undefined || data[col] === null) {
          throw new Error(`Argument \`${col}\` is missing.`);
        }
      }
      const row = { id: `fact-${facts.length + 1}`, isReviewed: false, ...data };
      facts.push(row);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: any) => {
      const keys: string[] = where.key?.in ? where.key.in : [where.key];
      let n = 0;
      for (let i = facts.length - 1; i >= 0; i--) {
        if (facts[i].documentId === where.documentId && keys.includes(facts[i].key)) {
          facts.splice(i, 1);
          n++;
        }
      }
      return { count: n };
    }),
    findFirst: vi.fn(async ({ where }: any) =>
      facts.find((f) => f.documentId === where.documentId && f.key === where.key) ?? null
    ),
  };

  const prisma: any = {
    documentFact: factApi,
    document: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    documentEntity: { create: vi.fn(async () => ({})) },
    organization: { update: vi.fn(async () => ({})) },
    entity: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'e1' })) },
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  };
  return { prisma, facts, factApi };
}

const extraction = (over: Partial<GeminiExtractionResult> = {}): GeminiExtractionResult =>
  ({
    documentType: 'RECEIPT',
    documentSubtype: null,
    detectedLanguage: 'en',
    rawText: 'ACME STORE\nTOTAL 42.00\nreceipt invoice',
    summary: 'a receipt',
    overallConfidence: 0.99,
    facts: [],
    entities: [],
    ...over,
  }) as any;

const persist = (svc: PersistenceService) =>
  svc.updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'uploads/f.jpg', 'f.jpg', extraction(), false);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the outcome marker records a recovery without clearing the failure', () => {
  it('writes extraction_recovered when the document HAD failed, carrying the class it failed with', async () => {
    const { prisma, facts } = makeDb();
    facts.push({
      id: 'pre-1', documentId: DOC_ID, key: 'extraction_error', factType: 'EXTRACTION_ERROR',
      valueString: 'RATE_LIMITED', valueNumber: 2, confidence: 1, sourceSpan: 'extraction_failure',
    });

    await persist(new PersistenceService(prisma));

    const marker = facts.find((f) => f.key === 'extraction_recovered');
    expect(marker).toBeDefined();
    expect(marker).toMatchObject({
      documentId: DOC_ID,
      key: 'extraction_recovered',
      factType: 'EXTRACTION_RECOVERED',
      sourceSpan: 'extraction_recovery',
      valueString: 'RATE_LIMITED',
    });
  });

  it('does NOT clear the extraction_error row — the failure genuinely happened', async () => {
    const { prisma, facts } = makeDb();
    facts.push({
      id: 'pre-1', documentId: DOC_ID, key: 'extraction_error', factType: 'EXTRACTION_ERROR',
      valueString: 'VENDOR_ERROR', valueNumber: 2, confidence: 1, sourceSpan: 'extraction_failure',
    });

    await persist(new PersistenceService(prisma));

    const err = facts.find((f) => f.key === 'extraction_error');
    expect(err).toBeDefined();
    expect(err.id).toBe('pre-1'); // same row, not deleted and rewritten
    expect(err.valueString).toBe('VENDOR_ERROR');
  });

  it('writes NO marker when the document never failed', async () => {
    const { prisma, facts } = makeDb();

    await persist(new PersistenceService(prisma));

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
  });

  it('replaces rather than accumulates across two recoveries', async () => {
    const { prisma, facts } = makeDb();
    facts.push({
      id: 'pre-1', documentId: DOC_ID, key: 'extraction_error', factType: 'EXTRACTION_ERROR',
      valueString: 'RATE_LIMITED', valueNumber: 2, confidence: 1, sourceSpan: 'extraction_failure',
    });

    const svc = new PersistenceService(prisma);
    await persist(svc);
    await persist(svc);

    expect(facts.filter((f) => f.key === 'extraction_recovered')).toHaveLength(1);
  });
});

describe('the two keys can never both be current — DocumentFact has no timestamp', () => {
  it('recordExtractionFailure deletes the recovery marker as it writes the failure', async () => {
    const { prisma, facts, factApi } = makeDb();
    facts.push({
      id: 'rec-1', documentId: DOC_ID, key: 'extraction_recovered', factType: 'EXTRACTION_RECOVERED',
      valueString: 'RATE_LIMITED', confidence: 1, sourceSpan: 'extraction_recovery',
    });

    await (new PersistenceService(prisma) as any).recordExtractionFailure(DOC_ID, 'VENDOR_ERROR', 2);

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
    expect(facts.find((f) => f.key === 'extraction_error')).toBeDefined();

    const keys = factApi.deleteMany.mock.calls[0][0].where.key;
    const deleted = keys?.in ? keys.in : [keys];
    expect(deleted).toEqual(expect.arrayContaining(['extraction_error', 'extraction_recovered']));
  });
});
