import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestionService } from './ingestionService';

// ============================================================================
// A PERFECT EXTRACTION THAT IS NEVER DELIVERED LEAVES NO TRACE.
// ============================================================================
// Measured, not hypothetical. doc10-tilden-taxi.jpg, 2026-09-09T01:53:03Z:
//
//   documentType        'UNKNOWN'   <- the raw upload stub, NOT the adapter's
//                                      empty result (which writes 'Unknown' /
//                                      'UNKNOWN_DOCUMENT_TYPE')
//   scanChargedAt       null        <- the charge is claimed inside the tx
//   extraction_model    present, reporting a real 'gemini-3.5-flash'
//   extraction_error    ABSENT
//   category/decision   ABSENT      <- everything written inside the tx
//
// Everything written OUTSIDE updateDocumentWithExtraction's transaction is
// there; everything written INSIDE it is gone. The model responded, the
// extraction was computed, and the persist threw it away. markAsNeedsReview
// writes only status and processedAt, which is why documentType never moved.
//
// The instrument called that a SUCCESS. recordExtractionFailure fires only when
// `!extractionResult || overallConfidence < 0.6`, and this extraction was fine —
// so the watch query read "extraction_error = [], success 10/10, failures: NONE"
// for a run in which one document delivered nothing.
//
// SEPARATE KEY, DELIBERATELY. This does NOT reuse extraction_error. That key
// already means "the vendor call failed", proven by every reading built on it,
// and folding a second meaning into one value is exactly the collapse that made
// 'LowConfidence' assert "the model succeeded and the document was poor" for
// every failure until #192. One key, one meaning.
// ============================================================================

const DOC = 'doc-delivery-1';

function makeService(opts: { persistThrows?: Error; extractThrows?: Error; lowConfidence?: boolean } = {}) {
  const svc = new IngestionService({} as any);
  const recordExtractionFailure = vi.fn().mockResolvedValue(undefined);
  const recordExtractionModel = vi.fn().mockResolvedValue(undefined);
  // Present on the double from the start, so a RED here means the CALL SITE is
  // missing rather than the method — a TypeError would prove much less.
  const recordDeliveryFailure = vi.fn().mockResolvedValue(undefined);
  const markAsNeedsReview = vi.fn().mockResolvedValue(undefined);
  const markAsFailed = vi.fn().mockResolvedValue(undefined);
  const updateDocumentWithExtraction = vi.fn().mockImplementation(async () => {
    if (opts.persistThrows) throw opts.persistThrows;
  });

  const extractFromImage = vi.fn().mockImplementation(async () => {
    if (opts.extractThrows) throw opts.extractThrows;
    return {
      detectedLanguage: 'en', documentType: 'Invoice', rawText: 'INVOICE total 120',
      summary: 'ok', facts: [], entities: [],
      overallConfidence: opts.lowConfidence ? 0.1 : 0.99,
      modelVersion: 'gemini-3.5-flash',
    };
  });

  (svc as any).geminiAdapter = { isSingleDocument: vi.fn().mockResolvedValue(true), extractFromImage };
  (svc as any).persistenceService = {
    recordExtractionFailure, recordExtractionModel, recordDeliveryFailure,
    updateDocumentWithExtraction, markAsNeedsReview, markAsFailed,
  };
  return { svc, recordExtractionFailure, recordExtractionModel, recordDeliveryFailure,
           markAsNeedsReview, markAsFailed, updateDocumentWithExtraction };
}

const run = (svc: IngestionService) =>
  svc.processUploadAsync(DOC, 'user-1', 'org-1', Buffer.from('bytes'), 'image/jpeg', 'doc10.jpg', 'org-1/doc10.jpg');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a successful extraction whose PERSIST fails leaves a queryable record', () => {
  it('records the delivery failure with the error CLASS', async () => {
    const { svc, recordDeliveryFailure } = makeService({
      persistThrows: new TypeError('transaction aborted'),
    });
    await run(svc);
    expect(recordDeliveryFailure).toHaveBeenCalledTimes(1);
    const [documentId, errorClass] = recordDeliveryFailure.mock.calls[0];
    expect(documentId).toBe(DOC);
    expect(errorClass).toBe('TypeError');
  });

  it('never persists the error MESSAGE — only its class', async () => {
    // redaction.ts ERROR-OBJECT POLICY: a persist error can echo a storage key,
    // which embeds the sanitized filename.
    const secret = 'org-1/2026/INVOICE-acme-holdings-confidential.jpg';
    const { svc, recordDeliveryFailure } = makeService({
      persistThrows: new Error(`Foreign key violation on ${secret}`),
    });
    await run(svc);
    const args = JSON.stringify(recordDeliveryFailure.mock.calls[0]);
    expect(args).not.toContain(secret);
    expect(args).not.toContain('acme-holdings');
    expect(recordDeliveryFailure.mock.calls[0][1]).toBe('Error');
  });

  it('does NOT write an extraction_error — the vendor call succeeded', async () => {
    // The whole point of a separate key. Overloading extraction_error would make
    // "the vendor failed" and "we lost a good extraction" indistinguishable,
    // which is the LowConfidence collapse again on a different axis.
    const { svc, recordExtractionFailure, recordDeliveryFailure } = makeService({
      persistThrows: new TypeError('transaction aborted'),
    });
    await run(svc);
    expect(recordExtractionFailure).not.toHaveBeenCalled();
    expect(recordDeliveryFailure).toHaveBeenCalledTimes(1);
  });

  it('still forces NEEDS_REVIEW — the existing fallback is unchanged', async () => {
    const { svc, markAsNeedsReview } = makeService({ persistThrows: new TypeError('x') });
    await run(svc);
    expect(markAsNeedsReview).toHaveBeenCalledTimes(1);
  });

  it('a throwing recordDeliveryFailure never breaks the pipeline', async () => {
    // Diagnostics must not become a new way for a detached background job to
    // die: this runs in a setImmediate after the 202 was already sent.
    const { svc, recordDeliveryFailure, markAsNeedsReview } = makeService({
      persistThrows: new TypeError('x'),
    });
    recordDeliveryFailure.mockRejectedValue(new Error('db down too'));
    await expect(run(svc)).resolves.toBeUndefined();
    expect(markAsNeedsReview).toHaveBeenCalledTimes(1);
  });
});

describe('the delivery record fires ONLY on delivery failure', () => {
  it('a clean run records nothing', async () => {
    const { svc, recordDeliveryFailure, recordExtractionFailure } = makeService();
    await run(svc);
    expect(recordDeliveryFailure).not.toHaveBeenCalled();
    expect(recordExtractionFailure).not.toHaveBeenCalled();
  });

  it('a VENDOR failure records extraction_error and NOT delivery', async () => {
    // The two keys must stay disjoint in both directions.
    const { svc, recordExtractionFailure, recordDeliveryFailure } = makeService({
      extractThrows: new TypeError('vendor exploded'),
    });
    await run(svc);
    expect(recordExtractionFailure).toHaveBeenCalledTimes(1);
    expect(recordDeliveryFailure).not.toHaveBeenCalled();
  });

  it('a LOW-CONFIDENCE extraction that persists fine records neither', async () => {
    const { svc, recordDeliveryFailure } = makeService({ lowConfidence: true });
    await run(svc);
    expect(recordDeliveryFailure).not.toHaveBeenCalled();
  });

  it('an extraction failure whose persist ALSO fails records BOTH', async () => {
    // Both things genuinely happened and both are separately true. This is the
    // case that would be silently collapsed if one key carried both meanings.
    const { svc, recordExtractionFailure, recordDeliveryFailure } = makeService({
      extractThrows: new TypeError('vendor exploded'),
      persistThrows: new RangeError('and the write failed too'),
    });
    await run(svc);
    expect(recordExtractionFailure).toHaveBeenCalledTimes(1);
    expect(recordDeliveryFailure).toHaveBeenCalledTimes(1);
    expect(recordDeliveryFailure.mock.calls[0][1]).toBe('RangeError');
  });
});
