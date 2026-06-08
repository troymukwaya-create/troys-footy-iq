import { create } from 'zustand';

// Same base-resolution as analytics.js — works in dev (proxy) and prod (Render).
const RAW_BASE = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/+$/, '')}/api`;
const TKEY = 'oddyessa_session';
const readToken = () => { try { return localStorage.getItem(TKEY); } catch { return null; } };

async function call(path, { method = 'GET', body, token } = {}) {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const useAuth = create((set, get) => ({
  token: readToken(),
  user: null,
  ready: false,           // finished the initial /me validation
  authOpen: false,        // sign-in modal
  slipsOpen: false,       // saved-slips modal

  openAuth: () => set({ authOpen: true }),
  closeAuth: () => set({ authOpen: false }),
  openSlips: () => set({ slipsOpen: true }),
  closeSlips: () => set({ slipsOpen: false }),

  // Validate the stored session on load → keeps people signed in across visits.
  init: async () => {
    const token = get().token;
    if (!token) { set({ ready: true }); return; }
    try {
      const res = await call('/auth/me', { token });
      if (res.ok) { const d = await res.json(); set({ user: d.user, ready: true }); }
      else { try { localStorage.removeItem(TKEY); } catch { /* ignore */ } set({ token: null, user: null, ready: true }); }
    } catch { set({ ready: true }); }
  },

  requestLink: async (email) => {
    try { const res = await call('/auth/request', { method: 'POST', body: { email } }); return res.ok; }
    catch { return false; }
  },

  verify: async (loginToken) => {
    try {
      const res = await call('/auth/verify', { method: 'POST', body: { token: loginToken } });
      if (!res.ok) return false;
      const d = await res.json();
      try { localStorage.setItem(TKEY, d.token); localStorage.setItem('oddyessa_welcomed', '1'); } catch { /* ignore */ }
      set({ token: d.token, user: d.user });
      return true;
    } catch { return false; }
  },

  googleAuth: async (credential) => {
    try {
      const res = await call('/auth/google', { method: 'POST', body: { credential } });
      if (!res.ok) return false;
      const d = await res.json();
      try { localStorage.setItem(TKEY, d.token); localStorage.setItem('oddyessa_welcomed', '1'); } catch { /* ignore */ }
      set({ token: d.token, user: d.user, authOpen: false });
      return true;
    } catch { return false; }
  },

  logout: async () => {
    const token = get().token;
    try { await call('/auth/logout', { method: 'POST', token }); } catch { /* ignore */ }
    try { localStorage.removeItem(TKEY); } catch { /* ignore */ }
    set({ token: null, user: null });
  },

  // Authenticated fetch helper for account features (saved slips, etc.)
  authedFetch: (path, opts = {}) => call(path, { ...opts, token: get().token }),
}));
