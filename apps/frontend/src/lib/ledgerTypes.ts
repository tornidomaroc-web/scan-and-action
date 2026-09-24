// The shape of GET /api/ledger. These types mirror LedgerMonth in
// apps/backend/src/services/ledger/ledgerCore.ts, which holds every rule
// (status, corrected amount, duplicates, month, currency, category).
//
// Kept apart from services/ledgerService.ts on purpose: this module imports
// nothing, so the view model and its tests never load the Supabase client.

/** Must equal EXPENSE_CATEGORIES in the backend; ledgerView.test.ts checks it. */
export const LEDGER_CATEGORIES = ['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other'] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export interface LedgerReceipt {
  documentId: string;
  date: string; // YYYY-MM-DD
  dateSource: 'document' | 'uploaded';
  amount: number;
  amountSource: 'extracted' | 'corrected';
  category: LedgerCategory | null;
  merchant: string | null;
  status: string;
}

export interface LedgerCategoryLine {
  category: LedgerCategory;
  total: number;
  receiptCount: number;
}

export interface LedgerCurrency {
  /** An ISO code, or null for receipts whose currency was not read. */
  currency: string | null;
  total: number;
  receiptCount: number;
  uncategorizedCount: number;
  categories: LedgerCategoryLine[];
  receipts: LedgerReceipt[];
}

export interface LedgerMonth {
  month: string; // YYYY-MM
  timeZone: string;
  /** Largest total first; the unknown currency last whatever its size. */
  currencies: LedgerCurrency[];
  excluded: { status: number; duplicate: number; noAmount: number };
}
