import { API_BASE_URL, getJsonHeaders } from './apiConfig';

export const accountService = {
  /**
   * Permanently delete the current user's account. `confirm` must be the user's
   * own email — the backend echoes it back against the authenticated session as
   * an explicit confirmation. Throws with a human-readable message on failure
   * (e.g. a 409 for a shared workspace).
   */
  async deleteAccount(confirm: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/account`, {
      method: 'DELETE',
      headers: await getJsonHeaders(),
      body: JSON.stringify({ confirm }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || 'Failed to delete account');
    }
  },
};
