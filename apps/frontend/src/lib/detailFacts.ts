// Same shape the other display helpers take (searchResultCard.ts:34). Declared
// locally rather than exported from there: this module is about WHICH facts the
// detail table may show, and it should not widen that file's public surface.
type Strings = Record<string, string>;

// ============================================================================
// WHICH FACTS THE DETAIL SCREEN SHOWS — AN ALLOWLIST, AND IT FAILS CLOSED.
// ============================================================================
// The Extracted Facts table used to filter with a DENYLIST of two keys
// ('decision', 'decision_reason'). Everything else fell through and rendered
// with its RAW KEY as the label, because fieldLabel ended in `map[key] || key`.
//
// That default is how three internal keys reached a user's screen. Measured on
// production 2026-09-11, every key that exists and how many documents carry it:
//
//     decision              254    extraction_error        20
//     decision_reason       238    review_action           10
//     TOTAL_AMOUNT          199    manual_amount           10
//     TRANSACTION_DATE      197    TAX_AMOUNT               3
//     category               47    justification_note       1
//     extraction_model       42    extraction_recovered     1
//
// On the canary (c176c0d5, Arabic UI) the table rendered `extraction_model`,
// `extraction_recovered` and `category` by their raw English keys — and
// `extraction_recovered` has a NULL valueString, so it read "not available" at
// "100% match": a raw key, an empty value, and a confident-looking pill.
//
// A DENYLIST CANNOT FIX THAT, because the failure is the default. Every one of
// those three keys was added to the backend by a change that never touched this
// file, and nothing here objected. Worse, `normalizeFactKey`
// (normalizationService.ts) ends in `rawKey.toUpperCase().replace(/\s+/g,'_')`,
// so a key nobody has ever written CAN be persisted the moment the extractor
// returns a field name nobody anticipated. The default must therefore be HIDE.
//
// ── HOW THIS LIST WAS BUILT, since a guess here is the bug it is fixing ─────
//
// Every key below carries rows in production TODAY and is a value a user
// entered or would recognise from their own document. Nothing is here on the
// grounds that it might arrive:
//
//   TOTAL_AMOUNT        199 docs   the extracted total
//   TRANSACTION_DATE    197 docs   the extracted date
//   TAX_AMOUNT            3 docs   tax on the receipt. The CURRENT adapter emits
//                                  only 'Date' and 'Total Amount'
//                                  (geminiAdapter.ts:291, :300), so these three
//                                  rows predate it — they still exist, and a
//                                  user looking at one of those three documents
//                                  should still see their tax.
//   manual_amount        10 docs   the amount the USER typed to correct the
//                                  extraction (documentController.ts:680). The
//                                  rule engine treats it as authoritative
//                                  (ruleEngineService.ts:103).
//   justification_note    1 doc    free text the USER wrote
//                                  (documentController.ts:699).
//
// TWO KEYS WERE CONSIDERED AND REJECTED FOR HAVING NO WRITER AT ALL:
//   APPOINTMENT_DATE  queryExecutor.ts:143 READS it; grep over apps/backend/src
//                     finds no write anywhere. Allowlisting it would be
//                     inventing a row that cannot exist.
//   PERSON_NAME       reachable only via normalizeFactKey('name'), and the
//                     adapter emits no 'name' fact. Same reason.
//
// ── WHAT IS HIDDEN, AND WHY EACH ────────────────────────────────────────────
//   decision, decision_reason  the DecisionBanner above the table already shows
//                              both, translated. Rendering them here duplicated
//                              a raw English enum into an Arabic screen.
//   extraction_model           pure telemetry: which model was requested and
//                              what the API resolved to, for the model-pin A/B
//                              (persistence.ts recordExtractionModel). It means
//                              nothing to a user and names internal models.
//   extraction_recovered       the RE-PROCESSED NOTICE already explains recovery
//                              in full, with a date, in all three locales
//                              (DocumentDetailScreen, driven by the DTO's
//                              `reprocessed`). The fact row is a strictly worse
//                              duplicate: its valueString is legitimately null,
//                              so it renders as "not available".
//   extraction_error           an internal failure class (RATE_LIMITED, …). It
//                              also SURVIVES a successful re-extraction, so on a
//                              recovered document it is stale — showing it would
//                              tell a user their document failed when it did not.
//   review_action              a raw snake_case enum ('amount_corrected',
//                              'marked_valid') recording which action ran. The
//                              result of that action is already shown: a
//                              correction appears as `manual_amount`, a note as
//                              `justification_note`.
//   category                   see the note on CATEGORY_IS_HIDDEN below.
//
// Anything not named above renders NOWHERE, and that is the point.
// ============================================================================

export const FACT_LABEL_KEY: Record<string, string> = {
  TOTAL_AMOUNT: 'totalAmount',
  TRANSACTION_DATE: 'transactionDate',
  TAX_AMOUNT: 'taxAmount',
  manual_amount: 'correctedAmount',
  justification_note: 'reviewNote',
};

// ── WHY `category` IS HIDDEN RATHER THAN TRANSLATED ─────────────────────────
// Translating it was the obvious move and it is the wrong one. Measured on
// production 2026-09-11: a `category` fact exists on 47 of 386 documents, and
// 43 of those 47 read "Other". The 0.5 the screen renders as "50% match" is not
// a measurement of anything — it is the hardcoded no-match return in
// expenseCategorizationService.ts:65, where an actual keyword match returns 0.9.
//
// So the row a user reads as "Category: Other — 50% match" means "no keyword in
// a five-entry Latin list matched this document", which is not a statement about
// their receipt. Translating it would render that failure in Arabic and dress a
// no-match as a half-confident finding.
//
// This is a display decision ONLY. The categorizer is untouched, the fact is
// still written, and every total is unaffected — nothing that computes money
// reads `category` (queryExecutor groups on 'EXPENSE_CATEGORY', a key that has
// never been written). Put it back in the list above when the categorizer earns
// it; that is one line, and this comment is the record of what to check first.
export const CATEGORY_IS_HIDDEN = 'category';

/**
 * The translated label for an allowlisted fact key, or null.
 *
 * Null for anything not allowlisted — there is deliberately NO raw-key
 * fallback, because that fallback is exactly what put `extraction_model` on a
 * user's screen. Null ALSO for an allowlisted key whose label is missing from
 * the current locale, so a gap in a translation hides a row rather than
 * rendering an empty cell or an English word on an Arabic page. That branch is
 * unreachable in practice and pinned that way by the locale-parity test.
 */
export const detailFactLabel = (key: unknown, s: Strings): string | null => {
  if (typeof key !== 'string') return null;
  const labelKey = FACT_LABEL_KEY[key];
  if (!labelKey) return null;
  const label = s?.[labelKey];
  return typeof label === 'string' && label ? label : null;
};

/**
 * The facts the detail table may render, in their original order.
 *
 * ONE rule, shared with the label: a fact renders if and only if
 * `detailFactLabel` can name it. Filtering on the key while labelling on the
 * string would let the two drift, which is the shape of the bug this replaces.
 */
export const visibleDetailFacts = <T extends { key?: unknown }>(
  facts: T[] | null | undefined,
  s: Strings
): T[] => (Array.isArray(facts) ? facts : []).filter((f) => detailFactLabel(f?.key, s) !== null);
