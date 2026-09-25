// The category of a document as the extractor stored it: the `category` fact,
// one of the eight ledger categories, or null when the document carries none
// (a business card, an appointment, a row from before the categorizer). The
// ledger home reads the same fact through /api/ledger; the other screens read
// it here, so a receipt shown as Food on the home is Food on its row and on
// its detail. Imports nothing with a side effect (ledgerTypes is pure).
import { LEDGER_CATEGORIES, LedgerCategory } from './ledgerTypes';

export const getDocumentCategory = (row: any): LedgerCategory | null => {
  const facts = Array.isArray(row?.facts) ? row.facts : [];
  const fact = facts.find((f: any) => String(f?.key ?? '') === 'category');
  const value = fact?.valueString;
  return typeof value === 'string' && (LEDGER_CATEGORIES as readonly string[]).includes(value)
    ? (value as LedgerCategory)
    : null;
};
