import { API_BASE_URL, getHeaders } from './apiConfig';

export const uploadDocument = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Upload failed with status: ${response.status}`);
  }

  return data;
};