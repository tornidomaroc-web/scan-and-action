import { DocumentDto } from '../types';
import { API_BASE_URL, getJsonHeaders, getAuthHeaders } from './apiConfig';

export const documentService = {
  async getDocumentDetail(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
      headers: await getAuthHeaders(),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to load document');
    }

    return res.json();
  },

  async getReviewQueue(): Promise<DocumentDto[]> {
    const res = await fetch(`${API_BASE_URL}/review`, {
      method: 'GET',
      headers: await getAuthHeaders()
    });
    // Read the body, exactly as getStats above already does (:48-51). Until this
    // line every non-ok status became the same opaque literal, so a server code
    // the UI is supposed to act on (IDENTITY_EMAIL_CONFLICT) was destroyed here
    // and ReviewQueueScreen could only ever offer a retry that cannot succeed.
    // No downstream handler can classify what this line threw away.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch review queue');
    }
    return res.json();
  },

  async getStats(): Promise<{
    totalCount: number,
    pendingCount: number,
    averageConfidence: number,
    plan?: 'FREE' | 'PRO',
    // PR-C1 additive analytics (optional: an older response without them still
    // renders exactly as before — the widgets fall back to placeholders).
    statusBreakdown?: { COMPLETED: number, NEEDS_REVIEW: number, REJECTED: number },
    monthlySeries?: Array<{ month: string, count: number }>,
    periods?: { thisMonth: { processed: number }, lastMonth: { processed: number } },
  }> {
    const res = await fetch(`${API_BASE_URL}/documents/stats`, {
      method: 'GET',
      headers: await getAuthHeaders()
    });
    // Read the body, exactly as getRecentActivity below already does (:50-53).
    // Until this line, `res` was discarded on failure and every non-ok status
    // became the same opaque literal — so a server code that the UI is supposed
    // to act on (IDENTITY_EMAIL_CONFLICT) was destroyed at this boundary and the
    // dashboard could only ever GUESS at the cause. The asymmetry with the
    // sibling calls was the defect; this removes it rather than special-casing.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch document stats');
    }
    return res.json();
  },

  async getRecentActivity(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/documents/recent`, {
      headers: await getAuthHeaders(),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to load recent activity');
    }

    return res.json();
  },

  async getAllActivity(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/documents/all`, {
      headers: await getAuthHeaders(),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to load activity history');
    }

    return res.json();
  },

  async updateStatus(id: string, status: 'COMPLETED' | 'NEEDS_REVIEW' | 'REJECTED'): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/documents/${id}/status`, {
      method: 'PATCH',
      headers: await getJsonHeaders(),
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update document status');
    }

    return res.json();
  },

  async exportCsv(): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/documents/export.csv`, {
      method: 'GET',
      headers: await getAuthHeaders()
    });
    // Same asymmetry as getReviewQueue above. The success path below reads a
    // blob, but the failure path never reaches it, so reading JSON here cannot
    // affect a successful export.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to export CSV');
    }
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async applyFixAction(id: string, actionType: string, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/documents/${id}/action`, {
      method: 'POST',
      headers: await getJsonHeaders(),
      body: JSON.stringify({ actionType, payload })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to submit action');
    }

    return res.json();
  },
};