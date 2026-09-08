import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestionService } from './ingestionService';

// ============================================================================
// A failed extraction must leave a QUERYABLE record. Today it leaves nothing.
// ============================================================================
// When every attempt fails, ingestionService.ts:118-127 substitutes a safe empty
// result — rawText '', confidence 0, documentType 'Unknown' — and persists it.
// The only trace of the failure is a console.error line in Railway stdout, which
// rotates and cannot be read from here.
//
// The consequence is measured, not hypothetical: 172 of 343 production documents
// (50.1%) hold rawText '' with confidence 0, and NOTHING stored distinguishes
// "extraction failed" from "this document was genuinely blank". That ambiguity
// is what makes all 172 rows unreadable, and it is what this record closes.
//
// Deliberately NOT stored: the error MESSAGE. redaction.ts's ERROR-OBJECT POLICY
// exists because a vendor error can echo a storage key (which embeds the
// sanitized filename) or a payload. The error CLASS plus the attempt count is
// enough to group failures without persisting anything user-derived.
// ============================================================================

const DOC = 'doc-1';

function makeService(opts: { extractThrows?: Error; lowConfidence?: boolean } = {}) {
  const svc = new IngestionService({} as any);
  const recordExtractionFailure = vi.fn().mockResolvedValue(undefined);
  const updateDocumentWithExtraction = vi.fn().mockResolvedValue(undefined);
  const markAsNeedsReview = vi.fn().mockResolvedValue(undefined);
  const markAsFailed = vi.fn().mockResolvedValue(undefined);

  const extractFromImage = vi.fn().mockImplementation(async () => {
    if (opts.extractThrows) throw opts.extractThrows;
    return {
      detectedLanguage: 'en', documentType: 'Invoice', rawText: 'INVOICE total 120',
      summary: 'ok', facts: [], entities: [],
      overallConfidence: opts.lowConfidence ? 0.1 : 0.99,
    };
  });

  (svc as any).geminiAdapter = { isSingleDocument: vi.fn().mockResolvedValue(true), extractFromImage };
  (svc as any).persistenceService = {
    recordExtractionFailure, updateDocumentWithExtraction, markAsNeedsReview, markAsFailed,
  };
  return { svc, recordExtractionFailure, updateDocumentWithExtraction, extractFromImage };
}

const run = (svc: IngestionService) =>
  svc.processUploadAsync(DOC, 'user-1', 'org-1', Buffer.from('bytes'), 'image/jpeg', 'x.jpg', 'org-1/x.jpg');

describe('a failed extraction leaves a queryable record', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('records the failure when every attempt throws', async () => {
    const { svc, recordExtractionFailure } = makeService({ extractThrows: new TypeError('vendor exploded') });

    await run(svc);

    expect(recordExtractionFailure, 'a failed extraction recorded nothing').toHaveBeenCalledTimes(1);
  });

  it('records the ERROR CLASS and the ATTEMPT COUNT', async () => {
    const { svc, recordExtractionFailure } = makeService({ extractThrows: new TypeError('vendor exploded') });

    await run(svc);

    const [documentId, errorClass, attempts] = recordExtractionFailure.mock.calls[0];
    expect(documentId).toBe(DOC);
    expect(errorClass).toBe('TypeError');
    expect(attempts).toBe(2); // MAX_ATTEMPTS
  });

  it('does NOT persist the error message — only the class', async () => {
    // A vendor error can echo a storage key, which embeds the sanitized
    // filename (redaction.ts ERROR-OBJECT POLICY).
    const secret = 'uploads/1730000000000-cv-john-smith.pdf';
    const { svc, recordExtractionFailure } = makeService({ extractThrows: new Error(secret) });

    await run(svc);

    const args = recordExtractionFailure.mock.calls[0];
    expect(JSON.stringify(args)).not.toContain(secret);
    expect(JSON.stringify(args)).not.toContain('cv-john-smith');
  });

  it('records the failure when every attempt returns LOW CONFIDENCE without throwing', async () => {
    // The loop can exhaust without a single throw: two sub-0.6 results leave
    // extractionResult set but weak. The fallback only triggers when it is
    // undefined, so this case must still be recorded as a failure to extract
    // usefully — otherwise the record misses half the ways this fails.
    const { svc, recordExtractionFailure } = makeService({ lowConfidence: true });

    await run(svc);

    expect(recordExtractionFailure).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a SUCCESSFUL extraction records no failure', async () => {
    const { svc, recordExtractionFailure, updateDocumentWithExtraction } = makeService();

    await run(svc);

    expect(recordExtractionFailure).not.toHaveBeenCalled();
    expect(updateDocumentWithExtraction).toHaveBeenCalledTimes(1);
  });

  it('still persists the empty fallback — the record is ADDITIONAL, not a replacement', async () => {
    const { svc, updateDocumentWithExtraction } = makeService({ extractThrows: new Error('boom') });

    await run(svc);

    expect(updateDocumentWithExtraction).toHaveBeenCalledTimes(1);
    const extraction = updateDocumentWithExtraction.mock.calls[0][5];
    expect(extraction.rawText).toBe('');
    expect(extraction.overallConfidence).toBe(0);
  });

  it('does not reject when recording the failure itself fails', async () => {
    // This runs in a detached setImmediate after the 202; a throw here would be
    // an unhandled rejection. The record is diagnostics — it must never become a
    // new way for the pipeline to die.
    const { svc, recordExtractionFailure, updateDocumentWithExtraction } = makeService({ extractThrows: new Error('boom') });
    recordExtractionFailure.mockRejectedValue(new Error('db down'));

    await expect(run(svc)).resolves.toBeUndefined();
    expect(updateDocumentWithExtraction).toHaveBeenCalledTimes(1);
  });
});
