import { describe, it, expect } from 'vitest';
import { NormalizationService } from './normalizationService';

// ============================================================================
// A RECEIPT IS STORED AS A RECEIPT.
// ============================================================================
// `DOCUMENT_TYPE_MAP` held no 'receipt' key, so `normalizeDocumentType` sent
// every receipt to its fallback and the column read 'UNKNOWN_DOCUMENT_TYPE'.
// Measured on production 2026-09-11 (prisma groupBy over all 385 rows):
// UNKNOWN_DOCUMENT_TYPE 323, INVOICE 40, UNKNOWN 22 — and RECEIPT **0**, in a
// product whose main subject is receipts.
//
// ── WHERE THE KEY COMES FROM, since a wrong guess here is what caused the bug ─
//
// The ONLY string that reaches this function is whatever the extraction prompt
// told the model to emit. That prompt (geminiAdapter.ts:203, :209) pins the
// vocabulary to exactly three literals:
//
//     4. CATEGORY: Correctly identify: "receipt" (point of sale),
//        "invoice" (bill for service), or "business_card".
//     "documentType": "invoice" | "receipt" | "business_card",
//
// and geminiAdapter.ts:281 passes `rawJson.documentType` through VERBATIM. So
// 'receipt' is the key, taken from the prompt and from nothing else.
//
// The raw value is NOT stored anywhere before normalisation — persistence.ts
// (:154, :415) writes only the normalised result, and `documentSubtype` is the
// hardcoded constant 'Professional Intelligence' (geminiAdapter.ts:282), not
// the raw type. The database therefore cannot be asked what the model returned
// on any existing row; the prompt is the whole evidence.
//
// NO French or Arabic receipt key is added here, deliberately. The map's
// existing 'facture'/'فاتورة'/'carte de visite'/'بطاقة عمل'/'rendez-vous'/'موعد'
// keys cannot fire: the prompt instructs English literals only. Adding more of
// them would repeat the exact mistake this file exists to fix — the dead
// 'business card' key below was written from imagination rather than from the
// prompt, and it has matched nothing for the life of the product.
// ============================================================================

const n = new NormalizationService();

// The three literals the extraction prompt names. Nothing else can arrive.
const PROMPT_LITERALS = ['invoice', 'receipt', 'business_card'] as const;

describe('normalizeDocumentType — the receipt key', () => {
  it('maps the prompt literal "receipt" to RECEIPT', () => {
    expect(n.normalizeDocumentType('receipt')).toBe('RECEIPT');
  });

  // The function lowercases and trims before lookup, so these are the same key
  // arriving in the shapes a model actually produces.
  it.each(['Receipt', 'RECEIPT', '  receipt  ', 'ReCeIpT'])(
    'maps %j to RECEIPT too, via the existing lowercase/trim',
    (raw) => {
      expect(n.normalizeDocumentType(raw)).toBe('RECEIPT');
    }
  );
});

describe('normalizeDocumentType — nothing else moves', () => {
  it.each([
    ['invoice', 'INVOICE'],
    ['facture', 'INVOICE'],
    ['فاتورة', 'INVOICE'],
    ['business card', 'BUSINESS_CARD'],
    ['carte de visite', 'BUSINESS_CARD'],
    ['بطاقة عمل', 'BUSINESS_CARD'],
    ['appointment', 'APPOINTMENT'],
    ['rendez-vous', 'APPOINTMENT'],
    ['موعد', 'APPOINTMENT'],
  ])('%j still maps to %s', (raw, expected) => {
    expect(n.normalizeDocumentType(raw)).toBe(expected);
  });

  it.each(['', '   ', 'passport', 'Other', 'receipts', 'a receipt'])(
    'still falls back to UNKNOWN_DOCUMENT_TYPE for %j',
    (raw) => {
      expect(n.normalizeDocumentType(raw)).toBe('UNKNOWN_DOCUMENT_TYPE');
    }
  );

  it('leaves the other three normalisers alone', () => {
    expect(n.normalizeFactKey('total')).toBe('TOTAL_AMOUNT');
    expect(n.normalizeFactKey('date')).toBe('TRANSACTION_DATE');
    expect(n.normalizeCurrency('$')).toBe('USD');
    expect(n.normalizeCurrency(undefined)).toBeUndefined();
  });
});

// ── THE GUARD THAT KEEPS THE RE-EXTRACTION GATE HONEST ──────────────────────
// documentController.ts:97 refuses a re-extraction when documentType is the
// plain literal 'UNKNOWN' — the upload stub's own value (uploadController.ts:89)
// — because a row still reading it NEVER REACHED THE PERSIST, i.e. it is one of
// the 10 rows declined as multi-document. That discriminator works only while
// this function can never itself RETURN 'UNKNOWN'. Adding keys to the map is
// precisely the edit that could break it: a well-meaning 'unknown': 'UNKNOWN'
// entry would make 89 recoverable rows indistinguishable from the 10 refused
// ones, and the gate would start refusing rows it exists to admit.
//
// Green before this change and after it. That is the point of a guard.
describe('the persisted value can never collide with the upload stub', () => {
  const STUB = 'UNKNOWN'; // documentController.ts:97

  it.each([
    ...PROMPT_LITERALS,
    'Unknown',   // geminiAdapter.ts:375 — the empty/failure result
    'Other',     // geminiAdapter.ts:281 — the missing-field fallback
    'UNKNOWN',
    'unknown',
    'receipt',
    '',
  ])('normalizeDocumentType(%j) does not return the stub literal', (raw) => {
    expect(n.normalizeDocumentType(raw)).not.toBe(STUB);
  });
});

// ── LEDGER ENTRY CLOSED — the underscore spelling now maps ──────────────────
// THIS BLOCK IS THE SAME LEDGER ENTRY, UPDATED RATHER THAN DELETED, and the
// history is the reason to keep it rather than start a fresh file.
//
// It was written by #204 to record a defect that change deliberately did not
// fix: the prompt says "business_card" with an UNDERSCORE, the map held
// 'business card' with a SPACE, so the third of the three literals the model is
// told to emit fell through to UNKNOWN_DOCUMENT_TYPE. It asserted the WRONG
// behaviour on purpose, so that fixing the defect would turn it red and force
// whoever did it to read the note. That is exactly what happened, and this is
// the other half of that contract: the expectations below are flipped, and the
// block stays so the next reader can see that a mapped 'business_card' is a
// decision with a measurement behind it rather than a key someone assumed.
//
// Measured on production 2026-09-11 before the fix, all 386 rows:
// `documentType = 'BUSINESS_CARD'` matched 0, while the same equality filter
// returned 40 for INVOICE — a real zero, not a query that could not match.
//
// The second test is now the stronger one, and it is the guard worth keeping:
// it does not name a spelling at all. It walks the three literals the prompt
// defines and asserts NONE of them falls through. Add a fourth type to the
// prompt without adding its key here and this goes red, which is the failure
// mode that produced both halves of this bug.
describe('every literal the extraction prompt names is mapped', () => {
  it('business_card (the prompt spelling) reaches BUSINESS_CARD', () => {
    expect(n.normalizeDocumentType('business_card')).toBe('BUSINESS_CARD');
  });

  // The lowercase/trim shapes a model actually produces, same as receipt above.
  it.each(['Business_Card', 'BUSINESS_CARD', '  business_card  '])(
    'maps %j to BUSINESS_CARD too',
    (raw) => {
      expect(n.normalizeDocumentType(raw)).toBe('BUSINESS_CARD');
    }
  );

  it('NONE of the three prompt literals is unmapped', () => {
    const unmapped = PROMPT_LITERALS.filter(
      (lit) => n.normalizeDocumentType(lit) === 'UNKNOWN_DOCUMENT_TYPE'
    );
    expect(unmapped).toEqual([]);
  });

  // The positive control for the test above. `toEqual([])` would also pass if
  // PROMPT_LITERALS were empty or the filter were inverted; this proves the
  // same predicate still separates a mapped literal from an unmapped string.
  it('and the same check still reports a genuinely unmapped string', () => {
    const unmapped = [...PROMPT_LITERALS, 'passport'].filter(
      (lit) => n.normalizeDocumentType(lit) === 'UNKNOWN_DOCUMENT_TYPE'
    );
    expect(unmapped).toEqual(['passport']);
  });
});
