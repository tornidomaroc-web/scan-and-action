import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// POST /api/documents/:id/reextract — recover a FAILED document's content
// without consuming a scan and without a re-upload.
// ============================================================================
// The file is already in Supabase storage at the row's fileUrl, so recovery
// needs no new upload. Before this endpoint the only route back was uploading
// the file again, which creates a NEW row and charges a scan
// (LAUNCH_TODO.md:128).
//
// THE SOURCE-STATE WHITELIST IS THE SAFETY PROPERTY, so it is tested as a
// whitelist, not as a blacklist of the states we happen to have thought of.
// Two states are admitted and everything else is refused:
//   * FAILED       — unconditionally. Nothing was ever extracted onto the row.
//   * NEEDS_REVIEW — ONLY in the empty shape: rawText '', overallConfidence 0,
//                    and no fact whose sourceSpan starts with 'user_'. A
//                    NEEDS_REVIEW row that holds real content, or any
//                    user-authored fact, is still refused.
//   * PROCESSING   — two writers, no lock. Refused, and this must stay true.
//   * COMPLETED    — destroys reviewed data.
//   * LIMIT_REACHED — the row exists BECAUSE the org was over quota; the
//                   status is written by uploadController.ts:127. Re-running it
//                   for free would hand back the scan the limit just refused.
//   * REJECTED     — a deliberate user decision; nothing to recover.
//
// The three NEEDS_REVIEW conditions are tested SEPARATELY rather than as one
// boolean, because each refuses a different row and a single combined test
// passes if any one of them is doing all the work.
//
// ORDERING IS PART OF THE CONTRACT. The download is the existence probe, and
// it runs BEFORE the row is touched, so a missing object leaves the row FAILED
// exactly as it was. Only after the bytes are in hand does the row move to
// PROCESSING, and that move is a CONDITIONAL update (where status is still
// FAILED) so two concurrent callers cannot both start extracting and append
// duplicate facts.
// ============================================================================

const mocks = vi.hoisted(() => ({
  docFindFirst: vi.fn(),
  docUpdateMany: vi.fn(),
  processUploadAsync: vi.fn(),
  downloadFromSupabase: vi.fn(),
  getSignedFileUrl: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    document: {
      findFirst: mocks.docFindFirst,
      updateMany: mocks.docUpdateMany,
    },
  },
}));

vi.mock('../services/storage/supabaseStorage', () => ({
  uploadToSupabase: vi.fn(),
  downloadFromSupabase: mocks.downloadFromSupabase,
}));

vi.mock('../services/storage/getSignedFileUrl', () => ({
  getSignedFileUrl: mocks.getSignedFileUrl,
}));

vi.mock('../services/ingestion/ingestionService', () => ({
  IngestionService: class {
    processUploadAsync = mocks.processUploadAsync;
  },
}));

import { DocumentController } from './documentController';

const ORG = 'org-aaaa';
const OTHER_ORG = 'org-bbbb';
const DOC = 'doc-cccc';

function makeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const makeReq = (organizationId = ORG) =>
  ({ params: { id: DOC }, user: { organizationId, userId: 'user-1' } }) as any;

// `facts` is present on every fixture because findFirst now INCLUDES the
// user-authored facts (bounded: only sourceSpan startsWith 'user_', take 1).
// Real Prisma always returns an array for an included relation, so a fixture
// that omitted it would let the guard read `undefined` in a way production
// never can — the mock would be more permissive than the database.
function failedDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    organizationId: ORG,
    userId: 'user-1',
    status: 'FAILED',
    fileUrl: 'uploads/1730000000000-receipt.jpg',
    originalFileName: 'receipt.jpg',
    scanChargedAt: null,
    rawText: '',
    overallConfidence: 0,
    facts: [],
    ...overrides,
  };
}

// The shape the widening admits: an extraction that produced nothing at all.
// 130 production rows match it (measured 2026-09-09), all carrying only
// machine-authored spans.
const emptyNeedsReview = (overrides: Record<string, unknown> = {}) =>
  failedDoc({ status: 'NEEDS_REVIEW', rawText: '', overallConfidence: 0, facts: [], ...overrides });

// A user-authored fact, as applyFixAction writes it (documentController.ts
// :461 user_correction / :480 user_justification) and updateStatus does
// (:247 user_status_change). Only the sourceSpan prefix is load-bearing.
const userFact = (sourceSpan: string) => ({ id: 'fact-1', sourceSpan });

const run = async (req: any = makeReq()) => {
  const res = makeRes();
  const next = vi.fn();
  await DocumentController.reextractDocument(req, res, next);
  return { res, next };
};

describe('DocumentController.reextractDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default happy path: bytes come back, the conditional claim wins.
    mocks.downloadFromSupabase.mockResolvedValue({
      buffer: Buffer.from('fake-image-bytes'),
      mimeType: 'image/jpeg',
    });
    mocks.docUpdateMany.mockResolvedValue({ count: 1 });
    mocks.processUploadAsync.mockResolvedValue(undefined);
  });

  // ---- org scoping, copied verbatim from getDocumentDetail / updateStatus ----

  it('404s when the document belongs to another organization', async () => {
    // findFirst is scoped by { id, organizationId }; a cross-org id simply misses.
    mocks.docFindFirst.mockResolvedValue(null);

    const { res } = await run(makeReq(OTHER_ORG));

    expect(res.statusCode).toBe(404);
    expect(mocks.docFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DOC, organizationId: OTHER_ORG }),
      })
    );
    // nothing downloaded, nothing claimed, nothing extracted
    expect(mocks.downloadFromSupabase).not.toHaveBeenCalled();
    expect(mocks.docUpdateMany).not.toHaveBeenCalled();
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  it('404s when the document does not exist at all', async () => {
    mocks.docFindFirst.mockResolvedValue(null);

    const { res } = await run();

    expect(res.statusCode).toBe(404);
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  // ---- the source-state whitelist ----

  // NEEDS_REVIEW is deliberately NOT in this loop any more: it is conditionally
  // admitted, and its refusals carry their own codes. It gets its own block.
  for (const status of ['PROCESSING', 'COMPLETED', 'REJECTED', 'LIMIT_REACHED']) {
    it(`refuses a ${status} document with 409 INVALID_SOURCE_STATE and does not extract`, async () => {
      // Given the empty shape and no user facts, so the ONLY thing refusing
      // this row is its status. Without that, a passing test would prove
      // nothing about the status check.
      mocks.docFindFirst.mockResolvedValue(failedDoc({ status }));

      const { res } = await run();

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('INVALID_SOURCE_STATE');
      // critically: no extraction, no status change, no download
      expect(mocks.processUploadAsync).not.toHaveBeenCalled();
      expect(mocks.docUpdateMany).not.toHaveBeenCalled();
      expect(mocks.downloadFromSupabase).not.toHaveBeenCalled();
    });
  }

  // PROCESSING is the one that must never move. Something is already writing
  // the row, and there is no lock: admitting it appends a duplicate fact set.
  it('STILL refuses PROCESSING even in the empty shape with no user facts', async () => {
    mocks.docFindFirst.mockResolvedValue(
      failedDoc({ status: 'PROCESSING', rawText: '', overallConfidence: 0, facts: [] })
    );

    const { res } = await run();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('INVALID_SOURCE_STATE');
    expect(mocks.docUpdateMany).not.toHaveBeenCalled();
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  it('accepts a FAILED document', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());

    const { res } = await run();

    expect(res.statusCode).toBe(202);
    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
  });

  // ---- the widening: empty NEEDS_REVIEW rows are admitted ----------------
  //
  // The exclusion of NEEDS_REVIEW rested on "these carry user-edited facts a
  // re-extraction would silently overwrite". Measured on production
  // 2026-09-09: 193 documents hold rawText '' AND overallConfidence 0 (130
  // NEEDS_REVIEW, 62 COMPLETED, 1 REJECTED) and NOT ONE of them holds a fact
  // whose sourceSpan starts with 'user_'. The same query finds 11 such facts
  // across 10 documents elsewhere, so the zero is a real zero and not a query
  // that cannot match. The whitelist was protecting data that does not exist.

  it('ADMITS an empty NEEDS_REVIEW row: rawText empty, confidence 0, no user facts', async () => {
    mocks.docFindFirst.mockResolvedValue(emptyNeedsReview());

    const { res } = await run();

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ status: 'PROCESSING', reextracting: true });
    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
  });

  it('re-extracts an admitted NEEDS_REVIEW row WITHOUT charging a scan', async () => {
    // 21 of the 130 admitted rows already carry a scanChargedAt stamp (measured
    // 2026-09-09) — unlike a FAILED row, which is never stamped. Charging is
    // off for both, and nothing refunds: the stamp is left exactly as it was.
    mocks.docFindFirst.mockResolvedValue(emptyNeedsReview({ scanChargedAt: new Date('2026-07-01') }));

    await run();

    const args = mocks.processUploadAsync.mock.calls[0];
    expect(args[args.length - 1]).toMatchObject({ chargeScan: false });
  });

  // Each condition refused on its own. Combined into one test, a single
  // condition doing all the work would look identical to all three working.

  it('REFUSES a NEEDS_REVIEW row that holds extracted text', async () => {
    mocks.docFindFirst.mockResolvedValue(
      emptyNeedsReview({ rawText: 'ACME STORE\nTOTAL 42.00' })
    );

    const { res } = await run();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_HAS_CONTENT');
    expect(mocks.downloadFromSupabase).not.toHaveBeenCalled();
    expect(mocks.docUpdateMany).not.toHaveBeenCalled();
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  it('REFUSES a NEEDS_REVIEW row with a non-zero confidence even when rawText is empty', async () => {
    mocks.docFindFirst.mockResolvedValue(emptyNeedsReview({ overallConfidence: 0.42 }));

    const { res } = await run();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_HAS_CONTENT');
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  // THE ONE THE GUARD EXISTS FOR.
  for (const span of ['user_correction', 'user_justification', 'user_status_change']) {
    it(`REFUSES an otherwise-empty NEEDS_REVIEW row carrying a '${span}' fact`, async () => {
      mocks.docFindFirst.mockResolvedValue(emptyNeedsReview({ facts: [userFact(span)] }));

      const { res } = await run();

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('DOCUMENT_HAS_USER_EDITS');
      // refused before the row is touched and before a paid extraction starts
      expect(mocks.downloadFromSupabase).not.toHaveBeenCalled();
      expect(mocks.docUpdateMany).not.toHaveBeenCalled();
      expect(mocks.processUploadAsync).not.toHaveBeenCalled();
    });
  }

  it('asks the database for user-authored facts by PREFIX, not by an enumerated list', async () => {
    // An enumerated list of the four spellings that exist today goes stale the
    // moment a fifth is added; the prefix is the contract updateStatus's own
    // comment names (documentController.ts:218-222).
    mocks.docFindFirst.mockResolvedValue(emptyNeedsReview());

    await run();

    expect(mocks.docFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          facts: expect.objectContaining({
            where: { sourceSpan: { startsWith: 'user_' } },
          }),
        }),
      })
    );
  });

  it('carries the WHOLE guard into the conditional claim, not just the status', async () => {
    // The read and the claim are two queries. Between them a user can submit a
    // correction, so a guard evaluated only at read time is a TOCTOU: the claim
    // must refuse the row the same way the read did.
    mocks.docFindFirst.mockResolvedValue(emptyNeedsReview());

    await run();

    expect(mocks.docUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC,
          organizationId: ORG,
          status: 'NEEDS_REVIEW',
          rawText: '',
          overallConfidence: 0,
          facts: { none: { sourceSpan: { startsWith: 'user_' } } },
        }),
        data: expect.objectContaining({ status: 'PROCESSING' }),
      })
    );
  });

  it('does NOT narrow FAILED: a FAILED row with content and user facts is still admitted', async () => {
    // The widening adds a state; it must not add conditions to the one that
    // already worked. FAILED stays unconditional.
    mocks.docFindFirst.mockResolvedValue(
      failedDoc({
        status: 'FAILED',
        rawText: 'partial text',
        overallConfidence: 0.7,
        facts: [userFact('user_correction')],
      })
    );

    const { res } = await run();

    expect(res.statusCode).toBe(202);
    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
    // and its claim stays exactly as narrow as it was — status only
    expect(mocks.docUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOC, organizationId: ORG, status: 'FAILED' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      })
    );
  });

  // ---- download is the existence probe, and it runs BEFORE any write ----

  it('409s SOURCE_FILE_UNAVAILABLE when the object is gone, and leaves the row untouched', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    mocks.downloadFromSupabase.mockRejectedValue(new Error('Object not found'));

    const { res } = await run();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SOURCE_FILE_UNAVAILABLE');
    // the row stays FAILED: no status write was even attempted
    expect(mocks.docUpdateMany).not.toHaveBeenCalled();
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  it('downloads BEFORE claiming the row, so a storage failure cannot strand it in PROCESSING', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    const order: string[] = [];
    mocks.downloadFromSupabase.mockImplementation(async () => {
      order.push('download');
      return { buffer: Buffer.from('b'), mimeType: 'image/png' };
    });
    mocks.docUpdateMany.mockImplementation(async () => {
      order.push('claim');
      return { count: 1 };
    });

    await run();

    expect(order).toEqual(['download', 'claim']);
  });

  // ---- the concurrency claim ----

  it('claims the row conditionally on it still being FAILED', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());

    await run();

    expect(mocks.docUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DOC, organizationId: ORG, status: 'FAILED' }),
        data: expect.objectContaining({ status: 'PROCESSING' }),
      })
    );
  });

  it('409s REEXTRACTION_IN_PROGRESS when the conditional claim matches nothing', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    mocks.docUpdateMany.mockResolvedValue({ count: 0 }); // someone else won

    const { res } = await run();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('REEXTRACTION_IN_PROGRESS');
    expect(mocks.processUploadAsync).not.toHaveBeenCalled();
  });

  // ---- THE ONE THAT MATTERS: re-extraction must not charge ----

  it('runs the pipeline with charging DISABLED', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());

    await run();

    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
    const args = mocks.processUploadAsync.mock.calls[0];
    // last argument carries the options; charging must be explicitly off
    expect(args[args.length - 1]).toMatchObject({ chargeScan: false });
  });

  it('passes the downloaded bytes and the MIME TYPE FROM THE DOWNLOAD, not from the row', async () => {
    // The Document model stores no MIME type; the download response is the only
    // place it exists. Getting this wrong sends a PDF to the image path.
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    mocks.downloadFromSupabase.mockResolvedValue({
      buffer: Buffer.from('pdf-bytes'),
      mimeType: 'application/pdf',
    });

    await run();

    const args = mocks.processUploadAsync.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining(['application/pdf', 'uploads/1730000000000-receipt.jpg'])
    );
    expect(Buffer.isBuffer(args[3])).toBe(true);
    expect(args[3].toString()).toBe('pdf-bytes');
  });

  it('returns 202 without waiting for the extraction to finish', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    let resolveExtraction: () => void = () => {};
    mocks.processUploadAsync.mockImplementation(
      () => new Promise<void>(r => { resolveExtraction = () => r(); })
    );

    const { res } = await run();

    expect(res.statusCode).toBe(202);
    resolveExtraction(); // nothing above awaited it
  });

  it('does not reject when the background extraction rejects', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());
    mocks.processUploadAsync.mockRejectedValue(new Error('gemini exploded'));

    const { res, next } = await run();

    expect(res.statusCode).toBe(202);
    expect(next).not.toHaveBeenCalled();
  });
});
