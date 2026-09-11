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

// ── DEFECT LEDGER, reported and deliberately NOT fixed in this change ────────
// The prompt says "business_card" with an UNDERSCORE; the map holds
// 'business card' with a SPACE. So the second of the three literals the model
// is told to emit also falls through to UNKNOWN_DOCUMENT_TYPE, and production
// holds 0 BUSINESS_CARD rows across all 385 documents — which in turn makes
// reportController.ts:36 ('recent_cards', filtering documentType eq
// 'BUSINESS_CARD') a report that can never return a row.
//
// It is left alone because the scope of this change is receipts and nothing
// else. WHEN THE FOLLOW-UP LANDS, THIS TEST GOES RED — flip the expectation to
// 'BUSINESS_CARD' and delete this block. Going red on the fix is intended: it
// forces whoever fixes it to notice this ledger rather than silently diverge.
describe('KNOWN GAP — the underscore spelling is still unmapped', () => {
  it('business_card (the prompt spelling) does NOT reach BUSINESS_CARD', () => {
    expect(n.normalizeDocumentType('business_card')).toBe('UNKNOWN_DOCUMENT_TYPE');
  });

  it('exactly one of the three prompt literals is still unmapped', () => {
    const unmapped = PROMPT_LITERALS.filter(
      (lit) => n.normalizeDocumentType(lit) === 'UNKNOWN_DOCUMENT_TYPE'
    );
    expect(unmapped).toEqual(['business_card']);
  });
});
