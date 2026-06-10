import axios from 'axios';

// Derive the API base robustly. VITE_API_URL may be unset (dev → '/api' via
// the Vite proxy) or a bare host in prod; normalise so it always ends in /api
// (same as adminClient). Without this, prod requests hit e.g. host/performance
// → 404 and the Brier hero stayed stuck on its fallback numbers forever.
const RAW = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW.endsWith('/api') ? RAW : `${RAW.replace(/\/+$/, '')}/api`;

const client = axios.create({
  baseURL: API_BASE,
  // Long enough to survive a Render cold start (~15-30s on the free tier).
  // The UI shows skeletons while React Query waits + retries; an honest slow
  // load beats a fast lie.
  timeout: 25000,
});

// Errors REJECT. The old interceptor resolved every failure as a fake-200
// empty payload, which (a) stopped React Query from ever retrying, and
// (b) cached "no fixtures" as if it were truth — a cold start rendered an
// empty dashboard until a hard reload. Every consumer already has its own
// catch/fallback; the transport layer must not invent data.
client.interceptors.response.use(
  response => response,
  error => {
    console.warn('[net] API call failed:', error?.config?.url, error?.code || error?.message || '');
    return Promise.reject(error);
  }
);

export default client;
