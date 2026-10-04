// ============================================================================
// Where a document's total came from: printed on the page, or worked out.
// ============================================================================
// The extraction prompt calls the total mandatory, so a page with no Total line
// still comes back with a figure: on 2026-09-30 the owner's test page returned
// 54.50, the sum of its line items, written with the same confidence and the
// same sourceSpan as a printed total. Nothing downstream could tell the two
// apart, and the ledger counted the sum as money (board: "A total the page never
// printed is stored as if it had been", ruled 2026-10-04).
//
// The provenance now rides on the TOTAL_AMOUNT fact itself, in the two columns
// every writer already fills:
//
//   printed   confidence 0.99, sourceSpan 'Primary Total'   (unchanged, and the
//                                                            default when the
//                                                            model says nothing)
//   inferred  confidence 0.6,  sourceSpan 'Inferred Total'
//
// The confidence is what moves the document: persistence.ts marks a fact below
// CONFIDENCE_THRESHOLD (0.98) as not reviewed and the document NEEDS_REVIEW.
// The sourceSpan is what names the cause: the rule engine reads it and writes
// "Total not printed", which Detail renders as a sentence in the reader's
// language, with the amount field to correct it.
//
// The figure itself is kept. ledgerCore.ts counts NEEDS_REVIEW documents, so the
// sum stays in the ledger as a draft; what changes is that it waits in the Queue
// with a reason the owner can read, and an edit there is what the ledger then
// counts. No existing row changes: a stored TOTAL_AMOUNT without this span is a
// printed total, exactly as it was read.
// ============================================================================

export const PRINTED_TOTAL_SPAN = 'Primary Total';
export const INFERRED_TOTAL_SPAN = 'Inferred Total';

/** Below persistence's CONFIDENCE_THRESHOLD (0.98), so the document goes to review. */
export const INFERRED_TOTAL_CONFIDENCE = 0.6;

/** The rule engine's reason, in the same finite vocabulary as the other four. */
export const TOTAL_NOT_PRINTED_REASON = 'Total not printed';

/** Exact match on the span: a fact carrying any other span is a printed total. */
export const isInferredTotal = (fact: { sourceSpan?: unknown } | null | undefined): boolean =>
  fact?.sourceSpan === INFERRED_TOTAL_SPAN;
