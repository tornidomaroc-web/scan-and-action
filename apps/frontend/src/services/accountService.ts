import { API_BASE_URL, getJsonHeaders } from './apiConfig';

/** What the backend did about a Sign in with Apple authorization (accountController.ts). */
export type AppleRevocationStatus = 'revoked' | 'failed' | 'skipped' | 'not_applicable' | 'not_configured';

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
  async deleteAccount(confirm: string, appleAuthorizationCode?: string): Promise<{ appleRevocation?: AppleRevocationStatus }> {
    let res: Response;
    // Only the fetch is guarded: a dropped connection rejects with
    // TypeError('Failed to fetch'), browser-generated English that would
    // otherwise render verbatim. Swap it for a code the whitelist can absorb.
    // The !res.ok throw below stays outside, so it is never swallowed here.
    try {
      res = await fetch(`${API_BASE_URL}/account`, {
        method: 'DELETE',
        headers: await getJsonHeaders(),
        body: JSON.stringify(appleAuthorizationCode ? { confirm, appleAuthorizationCode } : { confirm }),
      });
    } catch {
      throw new Error('NETWORK_ERROR');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'DELETE_FAILED');
    }
    const data = (await res.json().catch(() => ({}))) as { appleRevocation?: unknown };
    const status = typeof data.appleRevocation === 'string' ? (data.appleRevocation as AppleRevocationStatus) : undefined;
    return { appleRevocation: status };
  },
};
