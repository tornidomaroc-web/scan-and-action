import { API_BASE_URL, getJsonHeaders } from './apiConfig';

export const accountService = {
  /**
   * Permanently delete the current user's account. `confirm` must be the user's
   * own email — the backend echoes it back against the authenticated session as
   * an explicit confirmation.
   *
   * Throws with a RAW CODE, never display text: callers translate at the render
   * site via lib/accountErrors.ts. The server's `message` is deliberately not in
   * the chain — it is untranslated English prose, and the client never touches
   * it. Codes the whitelist doesn't know fall through to translated generic copy.
   */
  async deleteAccount(confirm: string): Promise<void> {
    let res: Response;
    // Only the fetch is guarded: a dropped connection rejects with
    // TypeError('Failed to fetch'), browser-generated English that would
    // otherwise render verbatim. Swap it for a code the whitelist can absorb.
    // The !res.ok throw below stays outside, so it is never swallowed here.
    try {
      res = await fetch(`${API_BASE_URL}/account`, {
        method: 'DELETE',
        headers: await getJsonHeaders(),
        body: JSON.stringify({ confirm }),
      });
    } catch {
      throw new Error('NETWORK_ERROR');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'DELETE_FAILED');
    }
  },
};
