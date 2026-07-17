import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from '../src/services/ingestion/ingestionService';

// ============================================================================
// The REAL multi-document behaviour — pins what a deleted client test faked.
// ============================================================================
// A client test (uploadGating.test.tsx "GATE 2: the multi-document validation
// error also paywalls non-PRO users") used to mock uploadDocument rejecting with
// 'Please upload a single document per image' and assert a paywall. That
// rejection is production-impossible: since 82e2697 ("Moved single-document
// validation from synchronous upload to async background processing"),
// uploadController.ts:85 returns 202 BEFORE the check runs, and
// ingestionService.ts:39-45 marks the document NEEDS_REVIEW WITHOUT throwing to
// the client. The awaited upload never rejects with that string, so the client
// branch keying off it was dead. That client test was green while pinning dead
// code; it was deleted with the code.
//
// This is its honest replacement. The multi-document path is a BACKGROUND server
// state transition with no client-facing error, so the thing worth pinning lives
// here: isSingleDocument() === false must mark NEEDS_REVIEW, abort extraction, and
// — critically — never throw, because the caller (the setImmediate in
// uploadController.ts:93) has already sent the 202 and a background throw would be
// an unhandled rejection.
// ============================================================================

describe('IngestionService.processUploadAsync — multi-document → NEEDS_REVIEW', () => {
  let svc: IngestionService;
  let isSingleDocument: ReturnType<typeof vi.fn>;
  let extractFromImage: ReturnType<typeof vi.fn>;
  let markAsNeedsReview: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // The constructor only console.warns without a Gemini key (geminiAdapter.ts:17),
    // so it is safe to build; we then replace its private collaborators with spies.
    svc = new IngestionService({} as any);
    isSingleDocument = vi.fn();
    extractFromImage = vi.fn();
    markAsNeedsReview = vi.fn().mockResolvedValue(undefined);
    (svc as any).geminiAdapter = { isSingleDocument, extractFromImage };
    (svc as any).persistenceService = { markAsNeedsReview };
  });

  const run = () =>
    svc.processUploadAsync(
      'doc-1',
      'user-1',
      'org-1',
      Buffer.from('fake-image-bytes'),
      'image/jpeg',
      'two-receipts.jpg',
      'org-1/two-receipts.jpg'
    );

  it('marks the document NEEDS_REVIEW, aborts extraction, and does NOT throw to the caller', async () => {
    isSingleDocument.mockResolvedValue(false); // multi-document detected

    // The caller (uploadController setImmediate) has already returned 202 — a
    // background throw here would be an unhandled rejection. It must resolve.
    await expect(run()).resolves.toBeUndefined();

    expect(isSingleDocument).toHaveBeenCalledOnce();
    expect(markAsNeedsReview).toHaveBeenCalledWith('doc-1');
    // Extraction is aborted for a multi-doc — no Gemini extraction call.
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it('still does not throw even if markAsNeedsReview itself rejects (the :41 catch swallows it)', async () => {
    isSingleDocument.mockResolvedValue(false);
    markAsNeedsReview.mockRejectedValue(new Error('db unavailable'));

    // ingestionService.ts:41-43 wraps markAsNeedsReview in .catch, so a persistence
    // failure is logged and swallowed — the background task never rejects.
    await expect(run()).resolves.toBeUndefined();

    expect(markAsNeedsReview).toHaveBeenCalledWith('doc-1');
    expect(extractFromImage).not.toHaveBeenCalled();
  });
});
