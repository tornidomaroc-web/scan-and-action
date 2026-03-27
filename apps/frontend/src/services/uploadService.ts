import { API_BASE_URL, getAuthHeaders } from './apiConfig';

export const uploadDocument = async (file: File): Promise<{ documentId: string; status: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData,
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // Accept 201 (legacy) and 202 (async) as success
  if (!response.ok && response.status !== 201 && response.status !== 202) {
    throw new Error(data?.error || data?.message || `Upload failed with status: ${response.status}`);
  }

  return data;
};
