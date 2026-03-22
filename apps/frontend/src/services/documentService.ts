import { API_BASE_URL, getHeaders } from './apiConfig';

export const documentService = {
  async getDocumentDetail(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
      headers: getHeaders()
    });
    
    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || 'Failed to load document');
    }
    return res.json();
  },

  async getReviewQueue(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/review`, {
      headers: getHeaders()
    });

    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || 'Failed to load review queue');
    }
    return res.json();
  }
};
