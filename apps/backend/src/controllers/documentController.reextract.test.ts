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
// whitelist, not as a blacklist of the three states we happen to have thought
// of. Anything that is not FAILED is refused:
//   * PROCESSING  — two writers, no lock;
//   * COMPLETED   — destroys reviewed data;
//   * NEEDS_REVIEW— those rows carry user-edited facts a re-extraction would
//                   silently overwrite. Deliberately out of v1.
//   * LIMIT_REACHED — the row exists BECAUSE the org was over quota; the
//                   status is written by uploadController.ts:127. Re-running it
//                   for free would hand back the scan the limit just refused.
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

function failedDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    organizationId: ORG,
    userId: 'user-1',
    status: 'FAILED',
    fileUrl: 'uploads/1730000000000-receipt.jpg',
    originalFileName: 'receipt.jpg',
    scanChargedAt: null,
    ...overrides,
  };
}

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

  for (const status of ['PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'LIMIT_REACHED']) {
    it(`refuses a ${status} document with 409 INVALID_SOURCE_STATE and does not extract`, async () => {
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

  it('accepts a FAILED document', async () => {
    mocks.docFindFirst.mockResolvedValue(failedDoc());

    const { res } = await run();

    expect(res.statusCode).toBe(202);
    expect(mocks.processUploadAsync).toHaveBeenCalledTimes(1);
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
