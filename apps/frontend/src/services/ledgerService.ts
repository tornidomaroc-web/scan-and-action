import { API_BASE_URL, getAuthHeaders } from './apiConfig';

// GET /api/ledger: the ONLY source of money figures for the ledger home.
// These types mirror LedgerMonth in apps/backend/src/services/ledger/ledgerCore.ts,
// which holds every rule (status, corrected amount, duplicates, month, currency,
// category). The screen renders what this returns; it never recomputes a figure.

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

export const ledgerService = {
  async getMonth(month: string, timeZone: string): Promise<LedgerMonth> {
    const q = new URLSearchParams({ month, tz: timeZone });
    const res = await fetch(`${API_BASE_URL}/ledger?${q.toString()}`, {
      headers: await getAuthHeaders(),
    });
    // The body is read on failure, as documentService does, so a code the UI
    // acts on (IDENTITY_EMAIL_CONFLICT) survives to the screen.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to load the ledger');
    }
    return res.json();
  },
};
