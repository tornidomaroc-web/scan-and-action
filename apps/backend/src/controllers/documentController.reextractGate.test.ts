import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// THE BUTTON IS RENDERED FROM THE SERVER'S OWN ANSWER.
// ============================================================================
// Until now the retry button rendered behind `doc.status === 'FAILED'` and
// production held ZERO FAILED rows, so it reached nobody and POST
// /:id/reextract had never run for a real user. Widening that gate raises one
// question and it is the whole subject of this file:
//
//   THE BUTTON MUST APPEAR ON EXACTLY THE ROWS THE ENDPOINT WOULD ACCEPT.
//
// A client-side restatement of the rules cannot do that. It would be a second
// copy that drifts the first time either side moves, and it cannot even be
// written correctly: the DTO carries no `rawText`, so a client cannot tell an
// empty NEEDS_REVIEW row from one holding content. So `getDocumentDetail` runs
// the endpoint's OWN predicate and ships the answer as `reextractable`.
//
// The property is pinned directly below: for every row shape, the flag and the
// endpoint agree. A change to one that is not made to the other fails here.
//
// ── THE NEW REFUSAL: documentType === 'UNKNOWN' ────────────────────────────
//
// `normalizeDocumentType` maps every unrecognised input to
// 'UNKNOWN_DOCUMENT_TYPE' ('unknown' is not a key of DOCUMENT_TYPE_MAP), so a
// row still reading plain 'UNKNOWN' — the upload stub's own value — NEVER
// REACHED THE PERSIST. One path does that and returns early: the multi-document
// decline at ingestionService.ts:91-108.
//
// Re-extraction re-runs that guard, but the guard is `isSingleDocument`, a
// Gemini call, non-deterministic, and today on a different model generation
// than the judgment that set these rows aside. If it flips, ONE TOTAL_AMOUNT is
// written for an image holding SEVERAL documents, and sum_expenses sums
// TOTAL_AMOUNT with no status filter — so a figure matching no real receipt
// enters the user's total at once. Measured 2026-09-10: 10 of the 110 admitted
// rows are in this shape, all of them in accounts other than the owner's.
// ============================================================================

const mocks = vi.hoisted(() => ({
  docFindFirst: vi.fn(),
  docUpdateMany: vi.fn(),
  processUploadAsync: vi.fn(),
  downloadFromSupabase: vi.fn(),
  getSignedFileUrl: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: { document: { findFirst: mocks.docFindFirst, updateMany: mocks.docUpdateMany } },
}));
vi.mock('../services/storage/supabaseStorage', () => ({
  uploadToSupabase: vi.fn(),
  downloadFromSupabase: mocks.downloadFromSupabase,
}));
vi.mock('../services/storage/getSignedFileUrl', () => ({ getSignedFileUrl: mocks.getSignedFileUrl }));
vi.mock('../services/ingestion/ingestionService', () => ({
  IngestionService: class { processUploadAsync = mocks.processUploadAsync; },
}));

import { DocumentController, reextractionRefusal } from './documentController';

const ORG = 'org-aaaa';
const DOC = 'doc-cccc';

// The upload stub's own documentType (uploadController.ts:89). Written out
// rather than imported so a rename of the constant cannot silently retune the
// test to whatever the source now says.
const STUB = 'UNKNOWN';
// What the persist rewrites it to for an empty extraction.
const PERSISTED = 'UNKNOWN_DOCUMENT_TYPE';

function makeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

// EVERY column the predicate reads is present on every fixture, including
// documentType. A fixture that omitted it would let the guard compare against
// `undefined` in a way production never can — the column is NOT NULL — and the
// mock would be more permissive than the database, which is the one thing a
// double must never be.
const row = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  organizationId: ORG,
  userId: 'user-1',
  status: 'NEEDS_REVIEW',
  documentType: PERSISTED,
  fileUrl: 'uploads/1730000000000-receipt.jpg',
  originalFileName: 'receipt.jpg',
  scanChargedAt: null,
  rawText: '',
  overallConfidence: 0,
  facts: [],
  ...over,
});

const userFact = { id: 'f1', sourceSpan: 'user_correction' };

// ── THE MATRIX. One row shape per line, with the answer both sides must give.
const CASES: Array<{ name: string; doc: any; refusedWith: string | null }> = [
  { name: 'the canary shape: empty NEEDS_REVIEW that reached the persist',
    doc: row(), refusedWith: null },
  { name: 'FAILED, admitted unconditionally',
    doc: row({ status: 'FAILED' }), refusedWith: null },
  { name: 'FAILED still admitted even carrying the stub documentType',
    doc: row({ status: 'FAILED', documentType: STUB }), refusedWith: null },
  { name: 'NEEDS_REVIEW holding content',
    doc: row({ rawText: 'ACME STORE TOTAL 42.00', overallConfidence: 0.91 }),
    refusedWith: 'DOCUMENT_HAS_CONTENT' },
  { name: 'NEEDS_REVIEW carrying a user-authored fact',
    doc: row({ facts: [userFact] }), refusedWith: 'DOCUMENT_HAS_USER_EDITS' },
  { name: 'NEEDS_REVIEW declined as multi-document (stub documentType)',
    doc: row({ documentType: STUB }), refusedWith: 'DOCUMENT_NOT_SINGLE' },
  // A type the normaliser can now produce. The guard keys on the STUB literal
  // alone, so widening DOCUMENT_TYPE_MAP must not move any answer in this
  // matrix — and a new persisted value must not be mistaken for the stub.
  { name: 'NEEDS_REVIEW carrying a real persisted type (RECEIPT)',
    doc: row({ documentType: 'RECEIPT' }), refusedWith: null },
  // Same property for the type the map gained next. BUSINESS_CARD is now a
  // value ingestion can write (normalizationService.ts, 'business_card'), and
  // this row must stay ADMITTED: the guard discriminates on the STUB literal
  // 'UNKNOWN' alone, so no widening of DOCUMENT_TYPE_MAP may move a refusal.
  { name: 'NEEDS_REVIEW carrying a real persisted type (BUSINESS_CARD)',
    doc: row({ documentType: 'BUSINESS_CARD' }), refusedWith: null },
  { name: 'COMPLETED', doc: row({ status: 'COMPLETED' }), refusedWith: 'INVALID_SOURCE_STATE' },
  { name: 'PROCESSING', doc: row({ status: 'PROCESSING' }), refusedWith: 'INVALID_SOURCE_STATE' },
  { name: 'LIMIT_REACHED', doc: row({ status: 'LIMIT_REACHED' }), refusedWith: 'INVALID_SOURCE_STATE' },
  { name: 'REJECTED', doc: row({ status: 'REJECTED' }), refusedWith: 'INVALID_SOURCE_STATE' },
];

const hasUserFact = (d: any) =>
  (d.facts ?? []).some((f: any) => typeof f.sourceSpan === 'string' && f.sourceSpan.startsWith('user_'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getSignedFileUrl.mockResolvedValue('https://signed.example/x.jpg');
  mocks.downloadFromSupabase.mockResolvedValue({ buffer: Buffer.from('bytes'), mimeType: 'image/jpeg' });
  mocks.docUpdateMany.mockResolvedValue({ count: 1 });
});

describe('the refusal predicate', () => {
  it.each(CASES)('$name', ({ doc, refusedWith }) => {
    const refusal = reextractionRefusal(doc, hasUserFact(doc));
    expect(refusal?.code ?? null).toBe(refusedWith);
  });

  it('every refusal carries a non-empty human sentence, not just a code', () => {
    for (const c of CASES) {
      const r = reextractionRefusal(c.doc, hasUserFact(c.doc));
      if (!r) continue;
      expect(typeof r.error, c.name).toBe('string');
      expect(r.error.trim().length, c.name).toBeGreaterThan(0);
    }
  });

  it('the stub documentType is the discriminator, NOT the persisted one', () => {
    // The persist rewrites 'Unknown' to 'UNKNOWN_DOCUMENT_TYPE'. If the guard
    // matched that instead, it would refuse the 100 rows it exists to admit.
    expect(reextractionRefusal(row({ documentType: PERSISTED }), false)).toBeNull();
    expect(reextractionRefusal(row({ documentType: STUB }), false)?.code).toBe('DOCUMENT_NOT_SINGLE');
  });
});

describe('getDocumentDetail ships the SAME answer the endpoint would give', () => {
  it.each(CASES)('$name — reextractable agrees with the predicate', async ({ doc, refusedWith }) => {
    mocks.docFindFirst.mockResolvedValue({ ...doc, documentEntities: [] });
    const res = makeRes();
    await DocumentController.getDocumentDetail(
      { params: { id: DOC }, user: { organizationId: ORG } } as any, res, vi.fn() as any
    );
    expect(res.statusCode).toBe(200);
    // THE PROPERTY: the button shows iff the endpoint would accept.
    expect(res.body.reextractable, 'the button would disagree with the server').toBe(refusedWith === null);
  });

  it('a row with a MACHINE-authored fact is still reextractable', async () => {
    // The detail handler must key on the 'user_' PREFIX, not on facts being
    // non-empty: every one of the 110 held rows carries rule_engine facts.
    mocks.docFindFirst.mockResolvedValue({
      ...row({ facts: [{ id: 'f1', sourceSpan: 'rule_engine' }, { id: 'f2', sourceSpan: 'auto_categorization' }] }),
      documentEntities: [],
    });
    const res = makeRes();
    await DocumentController.getDocumentDetail(
      { params: { id: DOC }, user: { organizationId: ORG } } as any, res, vi.fn() as any
    );
    expect(res.body.reextractable).toBe(true);
  });
});

describe('the endpoint refuses a multi-document row before touching anything', () => {
  const run = async () => {
    const res = makeRes();
    await DocumentController.reextractDocument(
      { params: { id: DOC }, user: { organizationId: ORG, userId: 'user-1' } } as any, res, vi.fn() as any
    );
    return res;
  };

  it('answers 409 DOCUMENT_NOT_SINGLE', async () => {
    mocks.docFindFirst.mockResolvedValue(row({ documentType: STUB }));
    const res = await run();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_NOT_SINGLE');
  });

  it('does NOT download the file and does NOT dispatch an extraction', async () => {
    // The refusal is before the existence probe, so a refused row costs no
    // storage read and — the part that matters — no paid Gemini call.
    mocks.docFindFirst.mockResolvedValue(row({ documentType: STUB }));
    await run();
    expect(mocks.downloadFromSupabase).not.toHaveBeenCalled();
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
    expect(mocks.docUpdateMany).not.toHaveBeenCalled();
  });

  it('still ADMITS the row the canary uses', async () => {
    mocks.docFindFirst.mockResolvedValue(row());
    const res = await run();
    expect(res.statusCode).toBe(202);
    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('the conditional claim repeats the whole guard', () => {
  it('carries documentType alongside the shape and the fact clause', async () => {
    mocks.docFindFirst.mockResolvedValue(row());
    const res = makeRes();
    await DocumentController.reextractDocument(
      { params: { id: DOC }, user: { organizationId: ORG, userId: 'user-1' } } as any, res, vi.fn() as any
    );
    const where = mocks.docUpdateMany.mock.calls[0][0].where;
    expect(where.rawText).toBe('');
    expect(where.overallConfidence).toBe(0);
    expect(where.facts).toEqual({ none: { sourceSpan: { startsWith: 'user_' } } });
    expect(where.documentType, 'the claim can still take a multi-document row').toEqual({ not: STUB });
  });

  it('leaves a FAILED claim unconditional, as it always was', async () => {
    mocks.docFindFirst.mockResolvedValue(row({ status: 'FAILED', documentType: STUB }));
    const res = makeRes();
    await DocumentController.reextractDocument(
      { params: { id: DOC }, user: { organizationId: ORG, userId: 'user-1' } } as any, res, vi.fn() as any
    );
    const where = mocks.docUpdateMany.mock.calls[0][0].where;
    expect(where.documentType).toBeUndefined();
    expect(where.rawText).toBeUndefined();
  });
});
