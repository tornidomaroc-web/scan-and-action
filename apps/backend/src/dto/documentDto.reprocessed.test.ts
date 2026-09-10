import { describe, it, expect } from 'vitest';
import { mapDocumentToDto, mapDocumentListToDto } from './documentDto';

// ============================================================================
// SURFACING A RECOVERY. Why this exists at all.
// ============================================================================
// On 2026-09-09, 20 documents were recovered by the re-extraction endpoint.
// Every one of them wrote a TOTAL_AMOUNT fact, and `sum_expenses`
// (queryExecutor.ts:58-70) groups TOTAL_AMOUNT facts with NO status filter by
// default — so those amounts entered "how much did I spend" the instant they
// were written. One organisation's summable total moved by 20,644.74 with
// nothing in the product saying why.
//
// A financial figure that moves with no explanation is indistinguishable from a
// bug, on the one number this product exists to produce. #200 landed the data
// that makes an explanation possible:
//
//   extraction_recovered   this document failed with the class in valueString,
//                          and a later extraction succeeded
//   Document.processedAt   when that later extraction landed
//
// NEITHER REACHED THE CLIENT. `processedAt` was absent from the DTO entirely,
// and while `facts` were mapped, the two LIST endpoints (getAllDocuments,
// getRecentDocuments) include no facts at all, so a list row could never see
// the marker. Both are fixed additively — no schema change.
//
// `reprocessed` is DERIVED here rather than left to the client, so detail (which
// includes every fact) and the list (which includes only the bounded recovery
// fact) produce the same shape from the same mapper.
// ============================================================================

const RECOVERED_FACT = {
  key: 'extraction_recovered',
  factType: 'EXTRACTION_RECOVERED',
  valueString: 'RATE_LIMITED',
  valueNumber: null,
  valueDate: null,
  currency: null,
  confidence: 1,
};

const AMOUNT_FACT = {
  key: 'TOTAL_AMOUNT',
  factType: 'AMOUNT',
  valueString: null,
  valueNumber: 54.11,
  valueDate: null,
  currency: 'USD',
  confidence: 0.99,
};

const PROCESSED_AT = new Date('2026-09-09T22:11:44.509Z');

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  originalFileName: 'receipt.jpg',
  fileUrl: 'uploads/receipt.jpg',
  documentType: 'RECEIPT',
  detectedLanguage: 'en',
  summary: 'a receipt',
  overallConfidence: 0.99,
  status: 'COMPLETED',
  uploadedAt: new Date('2026-09-08T18:07:53.354Z'),
  processedAt: PROCESSED_AT,
  facts: [],
  documentEntities: [],
  ...over,
});

describe('the DTO carries WHEN a document was processed', () => {
  it('exposes processedAt', () => {
    expect(mapDocumentToDto(doc())).toMatchObject({ processedAt: PROCESSED_AT });
  });

  it('exposes processedAt as null when the document has never been processed', () => {
    // The upload stub: PROCESSING, never persisted. Must not become undefined,
    // because the client distinguishes "never processed" from "field missing".
    expect(mapDocumentToDto(doc({ processedAt: null })).processedAt).toBeNull();
  });
});

describe('the DTO derives `reprocessed` from the recovery marker', () => {
  it('reports the failure class when an extraction_recovered fact is present', () => {
    const dto = mapDocumentToDto(doc({ facts: [AMOUNT_FACT, RECOVERED_FACT] }));
    expect(dto.reprocessed).toEqual({ failedWith: 'RATE_LIMITED' });
  });

  it('is null when the document was never recovered', () => {
    const dto = mapDocumentToDto(doc({ facts: [AMOUNT_FACT] }));
    expect(dto.reprocessed).toBeNull();
  });

  it('is null when the document carries no facts at all', () => {
    // The shape every list row had before this change. Must not throw.
    expect(mapDocumentToDto(doc({ facts: [] })).reprocessed).toBeNull();
    expect(mapDocumentToDto(doc({ facts: undefined })).reprocessed).toBeNull();
  });

  it('works from a BOUNDED include — only the recovery fact present', () => {
    // The list endpoints include `facts: { where: { key: 'extraction_recovered' } }`
    // so a row carries at most one fact. The same mapper must resolve it.
    const dto = mapDocumentToDto(doc({ facts: [RECOVERED_FACT] }));
    expect(dto.reprocessed).toEqual({ failedWith: 'RATE_LIMITED' });
  });

  it('carries the class VERBATIM, never a fabricated default', () => {
    const dto = mapDocumentToDto(doc({ facts: [{ ...RECOVERED_FACT, valueString: 'VENDOR_ERROR' }] }));
    expect(dto.reprocessed).toEqual({ failedWith: 'VENDOR_ERROR' });
  });

  it('survives a marker with a null class rather than inventing one', () => {
    const dto = mapDocumentToDto(doc({ facts: [{ ...RECOVERED_FACT, valueString: null }] }));
    expect(dto.reprocessed).toEqual({ failedWith: null });
  });
});

describe('the list mapper carries it too', () => {
  it('maps reprocessed and processedAt across a list', () => {
    const list = mapDocumentListToDto([
      doc({ id: 'a', facts: [RECOVERED_FACT] }),
      doc({ id: 'b', facts: [] }),
    ]);
    expect(list[0].reprocessed).toEqual({ failedWith: 'RATE_LIMITED' });
    expect(list[1].reprocessed).toBeNull();
    expect(list[0].processedAt).toEqual(PROCESSED_AT);
  });
});

describe('nothing existing regresses', () => {
  it('still maps the fields the app already reads', () => {
    const dto = mapDocumentToDto(doc({ facts: [AMOUNT_FACT] }));
    expect(dto).toMatchObject({
      id: 'doc-1',
      originalFileName: 'receipt.jpg',
      status: 'COMPLETED',
      overallConfidence: 0.99,
    });
    // the amount fact still arrives intact for getAmount()
    expect(dto.facts).toEqual([
      expect.objectContaining({ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 54.11 }),
    ]);
  });
});
