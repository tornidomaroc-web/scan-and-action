// The shape of GET /api/search. These types mirror SearchResult in
// apps/backend/src/services/ledger/receiptSearch.ts, which applies the
// ledger's rules (ledgerCore.judge) to every row it returns. Imports nothing,
// so the view model and its tests never load the Supabase client.
import type { LedgerCategory, LedgerReceipt } from './ledgerTypes';

export interface SearchHit extends LedgerReceipt {
  /** The receipt's own currency: an ISO code, or null when none was read. */
  currency: string | null;
}

export interface SearchCurrencyLine {
  currency: string | null;
  total: number;
  receiptCount: number;
}

export interface NotCountedHit {
  documentId: string;
  date: string; // YYYY-MM-DD
  merchant: string | null;
  fileName: string | null;
  status: string;
  reason: 'status' | 'duplicate' | 'noAmount';
  /** Its own category, the tile it would wear if counted; null when it has none. */
  category: LedgerCategory | null;
}

export interface SearchResult {
  /** 'recent' when nothing was asked: the newest receipts, no totals. */
  mode: 'recent' | 'filtered';
  q: string;
  category: LedgerCategory | null;
  month: string | null;
  timeZone: string;
  /** Newest first, each in its own currency. */
  receipts: SearchHit[];
  /** One line per currency, largest first, the unknown currency last; never added together. */
  currencies: SearchCurrencyLine[];
  /** Matching receipts the ledger does not count, each with its reason. */
  notCounted: NotCountedHit[];
}

export interface SearchParams {
  q: string;
  category: LedgerCategory | null;
  month: string | null;
}
