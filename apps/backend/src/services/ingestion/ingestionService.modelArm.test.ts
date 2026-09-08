import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IngestionService } from './ingestionService';
import { selectArm, modelForArm, ALIAS_MODEL } from '../extraction/modelArm';

// ============================================================================
// The arm must reach BOTH Gemini calls, and must be RECORDED on both outcomes.
// ============================================================================
// The A/B is worthless unless three things hold at once:
//
//   1. The same arm drives the validation call (ingestionService.ts:66) AND the
//      extraction call (:101). Pinning only extraction leaves the validation
//      call on the alias, which is a third of the call volume in the wrong arm.
//
//   2. The arm is recorded for EVERY document, success or failure. The metric
//      is extraction-call success rate per arm, so a success that records
//      nothing is a document that silently drops out of the denominator — and
//      the arm that succeeds more would lose more rows. That bias runs in
//      exactly the direction that would manufacture the result we are looking
//      for, which is the reason to pin it here.
//
//   3. The record survives a failure. It is written on the same principle as
//      recordExtractionFailure (#191): outside the persist transaction, so a
//      rolled-back persist cannot erase the evidence of which arm ran.
//
// The metric is read from extraction_error rows joined to this arm fact, and
// NEVER from document status: doc04-lakeside-catering (2026-09-08) reached
// COMPLETED while its rule decision read NEEDS_REVIEW, so status conflates the
// rule engine with the extraction outcome.
// ============================================================================

// Two ids chosen so the pure hash puts them in opposite arms — asserted below
// rather than assumed, so a change to the hash fails loudly here.
const IDS = [
  '00000000-1234-4abc-8def-0123456789ab',
  '00000001-1234-4abc-8def-0123456789ab',
];

function makeService(opts: { extractThrows?: Error } = {}) {
  const svc = new IngestionService({} as any);
  const recordExtractionFailure = vi.fn().mockResolvedValue(undefined);
  const recordExtractionModel = vi.fn().mockResolvedValue(undefined);
  const updateDocumentWithExtraction = vi.fn().mockResolvedValue(undefined);
  const markAsNeedsReview = vi.fn().mockResolvedValue(undefined);
  const markAsFailed = vi.fn().mockResolvedValue(undefined);

  const isSingleDocument = vi.fn().mockResolvedValue(true);
  const extractFromImage = vi.fn().mockImplementation(async () => {
    if (opts.extractThrows) throw opts.extractThrows;
    return {
      detectedLanguage: 'en', documentType: 'Invoice', rawText: 'INVOICE total 120',
      summary: 'ok', facts: [], entities: [], overallConfidence: 0.99,
      modelVersion: 'gemini-2.5-flash-001',
    };
  });

  (svc as any).geminiAdapter = { isSingleDocument, extractFromImage };
  (svc as any).persistenceService = {
    recordExtractionFailure, recordExtractionModel, updateDocumentWithExtraction,
    markAsNeedsReview, markAsFailed,
  };
  return {
    svc, isSingleDocument, extractFromImage,
    recordExtractionModel, recordExtractionFailure, updateDocumentWithExtraction,
  };
}

const run = (svc: IngestionService, id: string) =>
  svc.processUploadAsync(id, 'user-1', 'org-1', Buffer.from('bytes'), 'image/jpeg', 'x.jpg', 'org-1/x.jpg');

const savedEnv = { ...process.env };
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.GEMINI_AB_ENABLED = 'true';
  delete process.env.GEMINI_PINNED_MODEL;
});
afterEach(() => { process.env = { ...savedEnv }; });

describe('the two ids used here really do land in opposite arms', () => {
  it('one pinned, one alias — so the interleaving assertions below mean something', () => {
    const arms = IDS.map(selectArm);
    expect(new Set(arms).size).toBe(2);
  });
});

describe('the arm reaches BOTH Gemini calls', () => {
  it('passes the arm model to the extraction call', async () => {
    for (const id of IDS) {
      const { svc, extractFromImage } = makeService();
      await run(svc, id);
      const expected = modelForArm(selectArm(id));
      expect(extractFromImage.mock.calls[0][2]).toBe(expected);
    }
  });

  it('passes the SAME arm model to the validation call', async () => {
    for (const id of IDS) {
      const { svc, isSingleDocument, extractFromImage } = makeService();
      await run(svc, id);
      const expected = modelForArm(selectArm(id));
      expect(isSingleDocument.mock.calls[0][2]).toBe(expected);
      // and both calls agree, which is the property that keeps the arm clean
      expect(isSingleDocument.mock.calls[0][2]).toBe(extractFromImage.mock.calls[0][2]);
    }
  });

  it('with the experiment OFF, both calls use the alias for every id', async () => {
    process.env.GEMINI_AB_ENABLED = 'false';
    for (const id of IDS) {
      const { svc, isSingleDocument, extractFromImage } = makeService();
      await run(svc, id);
      expect(extractFromImage.mock.calls[0][2]).toBe(ALIAS_MODEL);
      expect(isSingleDocument.mock.calls[0][2]).toBe(ALIAS_MODEL);
    }
  });
});

describe('the arm is recorded on BOTH outcomes', () => {
  it('records the arm on a SUCCESSFUL extraction', async () => {
    const id = IDS[0];
    const { svc, recordExtractionModel } = makeService();
    await run(svc, id);
    expect(recordExtractionModel).toHaveBeenCalledTimes(1);
    const [documentId, arm, requested, resolved] = recordExtractionModel.mock.calls[0];
    expect(documentId).toBe(id);
    expect(arm).toBe(selectArm(id));
    expect(requested).toBe(modelForArm(selectArm(id)));
    expect(resolved).toBe('gemini-2.5-flash-001');
  });

  it('records the arm on a FAILED extraction too — the denominator must not lose rows', async () => {
    const id = IDS[1];
    const { svc, recordExtractionModel, recordExtractionFailure } = makeService({
      extractThrows: new TypeError('vendor exploded'),
    });
    await run(svc, id);
    expect(recordExtractionFailure).toHaveBeenCalledTimes(1);
    expect(recordExtractionModel).toHaveBeenCalledTimes(1);
    const [documentId, arm] = recordExtractionModel.mock.calls[0];
    expect(documentId).toBe(id);
    expect(arm).toBe(selectArm(id));
  });

  it('a throwing recordExtractionModel never breaks the pipeline', async () => {
    // Same principle as recordExtractionFailure: diagnostics must not become a
    // new way for a detached background job to die.
    const id = IDS[0];
    const { svc, recordExtractionModel, updateDocumentWithExtraction } = makeService();
    recordExtractionModel.mockRejectedValue(new Error('db down'));
    await expect(run(svc, id)).resolves.toBeUndefined();
    expect(updateDocumentWithExtraction).toHaveBeenCalledTimes(1);
  });
});
