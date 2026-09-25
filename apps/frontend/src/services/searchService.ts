import { API_BASE_URL, getAuthHeaders } from './apiConfig';
import type { SearchParams, SearchResult } from '../lib/searchTypes';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { fetchOrNetworkError, HttpStatusError } from '../lib/requestErrors';

// GET /api/search: the ONLY source of the Search screen's rows and figures.
// The backend applies the ledger's rules to every row (receiptSearch.ts), so
// a figure here is what /api/ledger would say for the same receipts. The
// screen renders what this returns; it never recomputes a figure.
//
// Until 2026-09-25 this file posted a question to the ask path, whose spend
// answer counted rejected receipts and duplicates and ignored corrections
// (board item (f)). No screen calls that path any more.

export const searchService = {
  async searchReceipts(params: SearchParams, timeZone: string): Promise<SearchResult> {
    const q = new URLSearchParams({ tz: timeZone });
    if (params.q.trim()) q.set('q', params.q.trim());
    if (params.category) q.set('category', params.category);
    if (params.month) q.set('month', params.month);
    // With a timeout: a request that never settles must become an error the
    // screen can show, not a skeleton forever (lib/fetchWithTimeout.ts). A
    // rejection is a NetworkError and a bad status an HttpStatusError, so the
    // screen can say which one happened (lib/requestErrors.ts).
    const url = `${API_BASE_URL}/search?${q.toString()}`;
    const headers = await getAuthHeaders();
    const res = await fetchOrNetworkError(url, () => fetchWithTimeout(url, { headers }));
    // The body is read on failure so a code the UI acts on
    // (IDENTITY_EMAIL_CONFLICT) survives to the screen.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new HttpStatusError(res.status, errorData.error || `HTTP_${res.status}`);
    }
    return res.json();
  },
};
