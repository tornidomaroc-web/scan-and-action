export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

export const getHeaders = () => ({
  'x-user-id': 'sys-demo-user'
});
