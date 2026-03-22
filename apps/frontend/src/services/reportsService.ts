import { QueryResultDto } from '../types';
import { API_BASE_URL, getHeaders } from './apiConfig';

export const reportsService = {
  async loadReport(reportId: string, language: string = 'en'): Promise<QueryResultDto> {
    const res = await fetch(`${API_BASE_URL}/reports/${reportId}?language=${language}`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       throw new Error(errorData.error || 'Failed to load smart report');
    }

    return res.json();
  }
};
