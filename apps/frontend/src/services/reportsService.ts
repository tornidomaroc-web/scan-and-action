import { QueryResultDto } from '../types';
import { API_BASE_URL, getJsonHeaders } from './apiConfig';

export const reportsService = {
  async loadReport(reportId: string, language: string = 'en'): Promise<QueryResultDto> {
    const res = await fetch(`${API_BASE_URL}/reports/${reportId}?language=${language}`, {
      method: 'GET',
      headers: await getJsonHeaders()
    });

    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || 'Failed to load smart report');
    }

    return res.json();
  }
};
