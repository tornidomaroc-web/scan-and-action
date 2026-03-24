import { QueryResultDto } from '../types';
import { API_BASE_URL, getJsonHeaders } from './apiConfig';

export const searchService = {
  async executeQuery(query: string, language: string, mockFilterOverride?: string): Promise<QueryResultDto> {
    const res = await fetch(`${API_BASE_URL}/search`, {
      method: 'POST',
      headers: await getJsonHeaders(),
      body: JSON.stringify({ query, language }),
    });

    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || 'Server error during search execution');
    }

    return res.json();
  }
};
