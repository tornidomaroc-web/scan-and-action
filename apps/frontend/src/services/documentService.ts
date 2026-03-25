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
    if (!res.ok) throw new Error('Failed to fetch review queue');
    return res.json();
  },

  async getStats(): Promise<{ totalCount: number, pendingCount: number, averageConfidence: number, plan?: 'FREE' | 'PRO' }> {
    const res = await fetch(`${API_BASE_URL}/documents/stats`, {
      method: 'GET',
      headers: await getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch document stats');
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
};