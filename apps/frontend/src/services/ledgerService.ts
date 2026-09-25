import { API_BASE_URL, getAuthHeaders } from './apiConfig';
import type { LedgerMonth } from '../lib/ledgerTypes';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

// GET /api/ledger: the ONLY source of money figures for the ledger home. The
// screen renders what this returns; it never recomputes a figure. The response
// shape is lib/ledgerTypes.ts.

export const ledgerService = {
  async getMonth(month: string, timeZone: string): Promise<LedgerMonth> {
    const q = new URLSearchParams({ month, tz: timeZone });
    // With a timeout: a request that never settles must become an error the
    // screen can show, not a skeleton forever (lib/fetchWithTimeout.ts).
    const res = await fetchWithTimeout(`${API_BASE_URL}/ledger?${q.toString()}`, {
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
