import { supabase } from '../lib/supabase';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getJsonHeaders = async () => {
  const authHeaders = await getAuthHeaders();

  return {
    'Content-Type': 'application/json',
    ...authHeaders,
  };
};