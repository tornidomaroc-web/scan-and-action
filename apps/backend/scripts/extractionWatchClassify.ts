/**
 * The FIRST-ATTEMPT outcome of one document, decided from what the pipeline
 * left behind. Pure: no database, no clock, so the test can hold it.
 *
 * WHY "FIRST ATTEMPT" AND NOT "CURRENT STATE". Re-extraction rewrites a failed
 * document into a success. Counting empty rows today therefore undercounts every
 * failure that has since been recovered, and the better recovery works the more
 * it understates. A first attempt is FAILED if ANY of these survived it:
 *
 *   extraction_error      the LAST vendor call failed, class in valueString
 *                         (persistence.ts recordExtractionFailure)
 *   extraction_recovered  it failed, then a re-extraction succeeded; the class
 *                         it failed with, or NULL when none was recorded
 *                         (persistence.ts, the isReextraction branch)
 *   the empty shape       rawText '' and overallConfidence 0, right now
 *   the clock             processedAt far after uploadedAt. Every processedAt
 *                         write is an extraction outcome, and /reextract admits
 *                         only FAILED or empty NEEDS_REVIEW rows, so a late
 *                         processedAt means a re-extraction of a failure. This is
 *                         the only trace left by a failure that recorded no class
 *                         AND was recovered before extraction_recovered existed.
 *
 * The two keys are mutually exclusive by construction: recordExtractionFailure
 * deletes extraction_recovered as it writes extraction_error.
 *
 * One caveat the class carries: for a document that was re-extracted and failed
 * AGAIN, extraction_error holds the class of the LAST failure, not the first.
 */

export const EMPTY_RAW_LEN = 0;
export const EMPTY_CONFIDENCE = 0;
/** The row `documentType` of an upload stub that never reached the persist. */
export const STUB_DOCUMENT_TYPE = 'UNKNOWN';

export type Outcome =
  | 'NOT_ATTEMPTED'   // LIMIT_REACHED: the quota gate refused it, no vendor call
  | 'UNRESOLVED'      // still PROCESSING
  | 'NEVER_PERSISTED' // stub type, no extraction_model: a multi-document decline, or
                      // (before extraction_model existed) a loss; indistinguishable
  | 'DELIVERY_LOST'   // extracted, then the persist rolled back
  | 'FAILED'          // the first vendor attempt failed
  | 'SUCCEEDED';

export interface DocRow {
  id: string;
  organizationId: string;
  status: string;
  documentType: string;
  rawLen: number;
  overallConfidence: number;
  uploadedAt: Date;
  processedAt: Date | null;
}

export interface Traces {
  error?: string | null;        // extraction_error.valueString, present => key present
  recovered?: string | null;    // extraction_recovered.valueString
  hasRecovered?: boolean;
  delivery?: string | null;     // delivery_error.valueString
  hasDelivery?: boolean;
  hasError?: boolean;
  hasModel?: boolean;           // extraction_model present
}

export interface Classified {
  outcome: Outcome;
  /** The recorded class, 'UNRECORDED' when the failure left none. */
  cls: string | null;
  /** How the failure was seen, so a reader can weigh each route separately. */
  via: 'error' | 'recovered' | 'empty' | 'clock' | 'delivery' | 'witness' | null;
  /** Re-extracted at some point, by the marker or by the clock. */
  reextracted: boolean;
}

export function isEmptyShape(d: Pick<DocRow, 'rawLen' | 'overallConfidence'>): boolean {
  return d.rawLen === EMPTY_RAW_LEN && d.overallConfidence === EMPTY_CONFIDENCE;
}

export function gapMinutes(d: Pick<DocRow, 'uploadedAt' | 'processedAt'>): number | null {
  if (!d.processedAt) return null;
  return (d.processedAt.getTime() - d.uploadedAt.getTime()) / 60000;
}

export function classify(d: DocRow, t: Traces, reextractGapMinutes: number): Classified {
  const gap = gapMinutes(d);
  const lateByClock = gap !== null && gap > reextractGapMinutes;
  const reextracted = !!t.hasRecovered || lateByClock;

  if (d.status === 'LIMIT_REACHED') return { outcome: 'NOT_ATTEMPTED', cls: null, via: null, reextracted };
  if (d.status === 'PROCESSING') return { outcome: 'UNRESOLVED', cls: null, via: null, reextracted };

  if (t.hasDelivery) return { outcome: 'DELIVERY_LOST', cls: t.delivery ?? 'UNRECORDED', via: 'delivery', reextracted };

  if (t.hasError) return { outcome: 'FAILED', cls: t.error ?? 'UNRECORDED', via: 'error', reextracted };
  if (t.hasRecovered) return { outcome: 'FAILED', cls: t.recovered ?? 'UNRECORDED', via: 'recovered', reextracted };

  if (d.documentType === STUB_DOCUMENT_TYPE && isEmptyShape(d)) {
    // A stub that ran extraction (extraction_model present) but carries no
    // error was a good extraction thrown away by the rollback: the five-clause
    // delivery witness. Without extraction_model it never reached the vendor
    // call's bookkeeping at all.
    return t.hasModel
      ? { outcome: 'DELIVERY_LOST', cls: 'UNRECORDED', via: 'witness', reextracted }
      : { outcome: 'NEVER_PERSISTED', cls: null, via: null, reextracted };
  }

  if (isEmptyShape(d)) return { outcome: 'FAILED', cls: 'UNRECORDED', via: 'empty', reextracted };
  if (lateByClock) return { outcome: 'FAILED', cls: 'UNRECORDED', via: 'clock', reextracted };

  return { outcome: 'SUCCEEDED', cls: null, via: null, reextracted };
}

/** Vendor-side classes, as geminiAdapter derives them. Anything else is not a vendor failure. */
export const VENDOR_CLASSES = ['RATE_LIMITED', 'VENDOR_ERROR', 'CLIENT_ERROR', 'PARSE_ERROR', 'OCR_FAILED', 'INTERNAL_ERROR'];
