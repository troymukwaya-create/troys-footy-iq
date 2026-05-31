// ─── ADMIN API CLIENT ───────────────────────────────────────────────
// Separate from api/client.js on purpose: the main client has a 1s timeout
// and a demo-data fallback interceptor that would corrupt dashboard data.
// The CEO dashboard needs REAL responses or honest errors — never fake data.

import axios from 'axios';

const TOKEN_KEY = 'fiq_admin_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};
export const clearToken = () => setToken(null);

// Derive the API base robustly. VITE_API_URL may be unset (dev → '/api' via
// the Vite proxy) or a bare host in prod; normalise so it always ends in /api.
const RAW = import.meta.env.VITE_API_URL || '/api';
export const API_BASE = RAW.endsWith('/api') ? RAW : `${RAW.replace(/\/+$/, '')}/api`;

const adminApi = axios.create({
  baseURL: `${API_BASE}/admin`,
  timeout: 12000,
});

// Attach the bearer token on every request.
adminApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, drop the token so the UI falls back to the login screen.
adminApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('fiq-admin-logout'));
    }
    return Promise.reject(error);
  }
);

export async function adminLogin(password) {
  const { data } = await adminApi.post('/login', { password });
  if (data?.token) { setToken(data.token); return true; }
  return false;
}

export default adminApi;
