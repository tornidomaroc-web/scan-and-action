// The category of a document as the extractor stored it: the `category` fact,
// one of the seven named ledger categories, or null when the document carries
// none (a business card, an appointment, a row from before the categorizer).
// The ledger home reads the same fact through /api/ledger; the other screens
// read it here, so a receipt shown as Food on the home is Food on its row and
// on its detail. Imports nothing with a side effect (ledgerTypes is pure).
//
// "Other" is not a category a document wears. The backend writes it when it
// read nothing on the list: the keyword matcher "returns Other if no keyword
// matches" (expenseCategorizationService.ts), and the extractor's enum Other
// means the same. Seen on 2026-09-26: malformed-test.jpg, an upload whose
// extraction failed with no merchant and no amount, carried `category: Other`
// from that fallback and wore the fuchsia Other tile on the Queue, stating a
// category nobody read. So a document with Other, like one with nothing, gets
// the neutral document tile and no category name; the home's Other card keeps
// the word for what it is there, the bucket of receipts not yet sorted.
import { LEDGER_CATEGORIES, LedgerCategory } from './ledgerTypes';

/** A named category, or null: a document never wears Other. */
export const wornCategory = (value: unknown): LedgerCategory | null =>
  typeof value === 'string' && value !== 'Other' && (LEDGER_CATEGORIES as readonly string[]).includes(value)
    ? (value as LedgerCategory)
    : null;

export const getDocumentCategory = (row: any): LedgerCategory | null => {
  const facts = Array.isArray(row?.facts) ? row.facts : [];
  const fact = facts.find((f: any) => String(f?.key ?? '') === 'category');
  return wornCategory(fact?.valueString);
};
