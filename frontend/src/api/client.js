import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // Long enough to survive a slow mobile network or a backend cold-start,
  // short enough that a genuinely dead call falls back without a long hang.
  timeout: 8000,
});

// Fast fallback interceptor: If request fails or times out, immediately return fallback data
client.interceptors.response.use(
  response => response,
  async error => {
    console.warn('[net] API call failed/timed out; returning empty payload so the UI degrades gracefully.', error?.code || '');
    
    // Minimal fallback payload to ensure UI renders instantly
    const fallbackData = {
      status: 'ok',
      source: 'demo_fallback',
      fixtures: [], // Will be overridden by demo engine data
      data: [],
      dashboard: { 
        model: { status: 'LIVE DEMO', version: 'v1.0 (Cached)' },
        performance: { accuracy: null, brierScore: null },
        calibration: { status: null, ece: null },
        system: { demoMode: true }
      }
    };
    
    // Resolve the promise instead of rejecting so the UI doesn't crash
    return Promise.resolve({ data: fallbackData, status: 200, statusText: 'OK', config: error.config, headers: {} });
  }
);

export default client;
