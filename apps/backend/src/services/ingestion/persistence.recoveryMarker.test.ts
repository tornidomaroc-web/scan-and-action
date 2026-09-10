import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { IngestionService } from './ingestionService';
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
//
// ─── WHAT THE MARKER MAY NOT DO ───────────────────────────────────────────
//
// It drives a user-visible badge and a notice reading "its details and amounts
// appear now and are counted in your totals". Three things must therefore be
// true before it is written, and a prior `extraction_error` row establishes
// only the third:
//
//   1. the document was RE-PROCESSED — not on its first pass. The stub
//      uploadController writes (rawText '', overallConfidence 0) is byte for
//      byte the EMPTY_SHAPE /reextract admits, so no gate reading the row can
//      separate the two. Only the caller knows.
//   2. this run SUCCEEDED — a re-extraction that fails again leaves the row as
//      empty as it was, and the notice would be false on it.
//   3. there was something to recover — a recorded failure class, or the empty
//      shape that 109 of the 110 admitted rows carry with no class at all.
// ============================================================================

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

// REQUIRED columns of DocumentFact per schema.prisma. The double enforces them,
// because a double that accepts a create missing `sourceSpan` cannot see the
// bug that made auto-categorization inert for its entire life (PR #188).
const REQUIRED_FACT_COLUMNS = ['documentId', 'factType', 'key', 'confidence', 'sourceSpan'];

// The Document row is MUTABLE here, and `update` really writes to it. That is
// what makes the ordering of the pre-update read testable at all: with the read
// moved below the update, findUnique returns the freshly-written text and the
// empty-shape clause can never fire again.
function makeDb(seedRow: Partial<{ rawText: string; overallConfidence: number }> = {}) {
  const facts: any[] = [];
  // Defaults are the UPLOAD STUB's own values (uploadController.ts:83-96),
  // which are also the shape /reextract admits. Every test here starts from the
  // shape that cannot tell the two paths apart.
  const doc: any = { id: DOC_ID, rawText: '', overallConfidence: 0, ...seedRow };

  const factApi = {
    create: vi.fn(async ({ data }: any) => {
      for (const col of REQUIRED_FACT_COLUMNS) {
        if (data[col] === undefined || data[col] === null) {
          throw new Error('Argument `' + col + '` is missing.');
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
    document: {
      findUnique: vi.fn(async () => ({ rawText: doc.rawText, overallConfidence: doc.overallConfidence })),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(doc, data);
        return doc;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    documentEntity: { create: vi.fn(async () => ({})) },
    organization: { update: vi.fn(async () => ({})) },
    entity: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'e1' })) },
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  };
  return { prisma, facts, factApi, doc };
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

// What the ADAPTER returns when it has failed: it self-catches and returns this
// rather than throwing (extraction/geminiAdapter.ts:328-385). rawText '' and
// confidence 0 are exactly the columns the EXTRACTED metric reads.
const failedExtraction = () =>
  extraction({ documentType: 'Unknown', rawText: '', summary: '', overallConfidence: 0 } as any);

const seedFailure = (facts: any[], valueString: string) =>
  facts.push({
    id: 'pre-1', documentId: DOC_ID, key: 'extraction_error', factType: 'EXTRACTION_ERROR',
    valueString, valueNumber: 2, confidence: 1, sourceSpan: 'extraction_failure',
  });

// THE RE-EXTRACTION PATH — what documentController.ts:483-497 dispatches.
const reextract = (svc: PersistenceService, ex: GeminiExtractionResult = extraction()) =>
  svc.updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'uploads/f.jpg', 'f.jpg', ex, false, {
    isReextraction: true,
  });

// THE UPLOAD PATH — what uploadController.ts:109 dispatches. No options at all,
// which is the point: the defaults have to be safe.
const firstUpload = (svc: PersistenceService, ex: GeminiExtractionResult = extraction()) =>
  svc.updateDocumentWithExtraction(DOC_ID, USER_ID, ORG_ID, 'uploads/f.jpg', 'f.jpg', ex);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the outcome marker records a recovery without clearing the failure', () => {
  it('writes extraction_recovered when the document HAD failed, carrying the class it failed with', async () => {
    const { prisma, facts } = makeDb();
    seedFailure(facts, 'RATE_LIMITED');

    await reextract(new PersistenceService(prisma));

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
    seedFailure(facts, 'VENDOR_ERROR');

    await reextract(new PersistenceService(prisma));

    const err = facts.find((f) => f.key === 'extraction_error');
    expect(err).toBeDefined();
    expect(err.id).toBe('pre-1'); // same row, not deleted and rewritten
    expect(err.valueString).toBe('VENDOR_ERROR');
  });

  it('replaces rather than accumulates across two recoveries', async () => {
    const { prisma, facts } = makeDb();
    seedFailure(facts, 'RATE_LIMITED');

    const svc = new PersistenceService(prisma);
    await reextract(svc);
    await reextract(svc);

    expect(facts.filter((f) => f.key === 'extraction_recovered')).toHaveLength(1);
  });
});

describe('the marker is tied to the RE-EXTRACTION PATH, not to the row it finds', () => {
  // ── The row shape cannot answer this, and the failure lands on the happy path.
  //
  // uploadController.ts:83-96 creates every stub with rawText '' and
  // overallConfidence 0. documentController.ts:46 admits exactly that shape for
  // re-extraction, and its claim at :461 moves the row to PROCESSING leaving
  // both columns untouched. So the first pass over a fresh upload and a
  // re-extraction of a held row are indistinguishable by inspection, and a gate
  // reading the row marks EVERY document anyone uploads as "Re-processed".
  it('writes NO marker on a FIRST upload, though the stub is in the admitted empty shape', async () => {
    const { prisma, facts, doc } = makeDb();
    expect(doc.rawText).toBe('');          // the stub, and the admitted shape,
    expect(doc.overallConfidence).toBe(0); // asserted so this cannot rot silently

    await firstUpload(new PersistenceService(prisma));

    expect(
      facts.find((f) => f.key === 'extraction_recovered'),
      'a first upload was marked as re-processed — the gate is reading the row, not the caller'
    ).toBeUndefined();
  });

  // ── The bug this closes, at the level it actually happens.
  //
  // recordExtractionFailure runs BEFORE the persist (ingestionService.ts:176-197
  // then :228), so on a FIRST upload whose extraction failed there is already an
  // extraction_error row on the document when this method reads for one. Gating
  // on that row alone therefore fires on first uploads.
  it('writes NO marker on a FIRST upload that failed, even though a class is already recorded', async () => {
    const { prisma, facts } = makeDb();
    seedFailure(facts, 'RATE_LIMITED');

    await firstUpload(new PersistenceService(prisma), failedExtraction());

    expect(
      facts.find((f) => f.key === 'extraction_recovered'),
      'a first upload that FAILED was marked as re-processed'
    ).toBeUndefined();
  });

  // ── The same thing through the real pipeline, because the ordering above is
  // the whole reason the previous test matters and a unit test only assumes it.
  it('end to end: a failing first upload writes extraction_error and NO marker', async () => {
    const { prisma, facts } = makeDb();
    const svc = new IngestionService(prisma);
    (svc as any).persistenceService = new PersistenceService(prisma);
    (svc as any).geminiAdapter = {
      isSingleDocument: vi.fn().mockResolvedValue(true),
      extractFromImage: vi.fn().mockResolvedValue({
        detectedLanguage: 'en', documentType: 'Unknown', rawText: '', summary: '',
        facts: [], entities: [], overallConfidence: 0, failureCause: 'RATE_LIMITED',
      }),
    };

    // No opts — the upload path (uploadController.ts:109).
    await svc.processUploadAsync(DOC_ID, USER_ID, ORG_ID, Buffer.from('b'), 'image/jpeg', 'x.jpg', 'o/x.jpg');

    expect(facts.find((f) => f.key === 'extraction_error'), 'the failure was not recorded').toBeDefined();
    expect(
      facts.find((f) => f.key === 'extraction_recovered'),
      'a fresh upload that never succeeded carries a "Re-processed" badge'
    ).toBeUndefined();
  });
});

describe('a re-extraction over an empty row with NO recorded class still explains itself', () => {
  // 109 of the 110 rows /reextract admits carry no extraction_error at all
  // (measured on production, 2026-09-10). Without this they recover with no
  // badge and their amounts join the user's totals unannounced.
  it('writes the marker with a NULL class when nothing recorded why it failed', async () => {
    const { prisma, facts } = makeDb();

    await reextract(new PersistenceService(prisma));

    const marker = facts.find((f) => f.key === 'extraction_recovered');
    expect(marker, 'an empty row recovered with no badge').toBeDefined();
    expect(marker).toMatchObject({
      key: 'extraction_recovered',
      factType: 'EXTRACTION_RECOVERED',
      sourceSpan: 'extraction_recovery',
    });
    // NULL, not a stand-in string: no cause was ever recorded for this document
    // and inventing one would assert something nobody measured.
    expect(marker.valueString ?? null).toBeNull();
  });

  it('leaves exactly ONE marker when the same document is re-extracted twice', async () => {
    const { prisma, facts } = makeDb();
    const svc = new PersistenceService(prisma);

    await reextract(svc);
    await reextract(svc); // the row now holds content; the marker must not double

    expect(facts.filter((f) => f.key === 'extraction_recovered')).toHaveLength(1);
  });

  // ⚠ THE PIN ON THE READ ORDER. `before` is read at the top of the
  // transaction; `tx.document.update` overwrites rawText and overallConfidence
  // a few statements later. Move the read below the update and it sees the
  // NEW values, the empty-shape clause can never fire, and every classless
  // recovery silently loses its badge. The double's `update` really mutates the
  // row, so that mistake shows up here as a missing marker.
  it('reads the PRE-update shape, not the row it just wrote', async () => {
    const { prisma, facts, doc } = makeDb();

    await reextract(new PersistenceService(prisma));

    expect(doc.rawText, 'the update did not run').not.toBe('');
    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeDefined();
  });

  // The row was NOT empty and nothing had failed: there is nothing to recover
  // and no reason to tell the user anything.
  it('writes NO marker when the row already held content and never failed', async () => {
    const { prisma, facts } = makeDb({ rawText: 'PRIOR CONTENT', overallConfidence: 0.91 });

    await reextract(new PersistenceService(prisma));

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
  });
});

describe('the notice claims details appear now, so a failed re-run must not carry it', () => {
  // The user-facing sentence is "its details and amounts appear now and are
  // counted in your totals". A re-extraction that fails again leaves the row
  // exactly as empty as it was; the same marker would put that sentence on a
  // document holding nothing.
  it('writes NO marker when the re-extraction fails again, with a class on file', async () => {
    const { prisma, facts } = makeDb();
    seedFailure(facts, 'RATE_LIMITED');

    await reextract(new PersistenceService(prisma), failedExtraction());

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
  });

  it('writes NO marker when the re-extraction fails again with no class on file', async () => {
    const { prisma, facts } = makeDb();

    await reextract(new PersistenceService(prisma), failedExtraction());

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
  });

  // The metric is the COLUMNS (rawText !== '' AND overallConfidence > 0), the
  // same pair the EXTRACTED number is defined on. Text with a zero score is not
  // a success by that definition and must not be reported as one here either.
  it('writes NO marker for text that scored zero — the EXTRACTED metric is both columns', async () => {
    const { prisma, facts } = makeDb();
    seedFailure(facts, 'RATE_LIMITED');

    await reextract(new PersistenceService(prisma), extraction({ overallConfidence: 0 } as any));

    expect(facts.find((f) => f.key === 'extraction_recovered')).toBeUndefined();
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
