// ─── React Query hooks for all data fetching ───────────────────────
// Centralized data hooks with caching, error handling, and deduplication.
// IMPORTANT: Each hook specifies staleTime, retry, and enabled conditions
// to prevent rendering partial or invalid data.

import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Retry interceptor for network errors
api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    if (!config._retried && (error.code === 'ERR_NETWORK' || error.response?.status >= 500)) {
      config._retried = true;
      await new Promise(r => setTimeout(r, 2000));
      return api(config);
    }
    return Promise.reject(error);
  }
);

// ─── FIXTURES ───────────────────────────────────────────────────────

// Persist the last good fixtures payload to localStorage so a page reload
// paints instantly from cache (stale-while-revalidate) — even while the
// backend is still waking from a cold start. Fresh data swaps in silently.
const FIXTURES_CACHE_KEY = 'oddyessa_fixtures_v1';
function readFixturesCache() {
  try {
    const raw = localStorage.getItem(FIXTURES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.fixtures) && parsed.fixtures.length ? parsed : undefined;
  } catch { return undefined; }
}
function writeFixturesCache(value) {
  try { localStorage.setItem(FIXTURES_CACHE_KEY, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function useFixtures() {
  return useQuery({
    queryKey: ['fixtures'],
    queryFn: async () => {
      const { data } = await api.get('/fixtures/all');
      const fixtures = Array.isArray(data) ? data : (data?.fixtures || []);
      const source = data?.source || 'api';
      const result = { fixtures, source };
      if (fixtures.length) writeFixturesCache(result); // only cache real, non-empty data
      return result;
    },
    // Instant paint on reload from last good data; marked stale (updatedAt 0)
    // so it still refetches fresh data in the background immediately.
    initialData: readFixturesCache,
    initialDataUpdatedAt: 0,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useLiveMatches() {
  return useQuery({
    queryKey: ['live-matches'],
    queryFn: async () => {
      const { data } = await api.get('/fixtures/live');
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    retry: 2,
  });
}

// ─── ANALYSIS ───────────────────────────────────────────────────────

export function useAnalysis(matchId) {
  return useQuery({
    queryKey: ['analysis', matchId],
    queryFn: async () => {
      const { data } = await api.get(`/analysis/${matchId}`);

      // Validate response structure
      if (!data || data.error) {
        throw new Error(data?.message || 'Analysis request failed');
      }

      return data;
    },
    enabled: !!matchId,
    staleTime: (query) => {
      // Dynamic staleTime based on data quality
      const quality = query?.state?.data?.dataQuality;
      if (quality === 'COMPLETE') return 24 * 60 * 60 * 1000; // 24h
      if (quality === 'PARTIAL') return 5 * 60 * 1000; // 5 min — retry soon
      return 60 * 1000; // 1 min for insufficient — retry aggressively
    },
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
  });
}

// ─── AI ANALYSIS (progressive load — runs in parallel with useAnalysis) ───
// Calls /api/analysis/:id/ai which: cache-checks (instant) or computes
// fresh via Claude (5-30s). Uses a longer 60s timeout to survive Claude
// cold calls. The frontend renders AI section as a skeleton until this
// resolves, while model predictions from useAnalysis render immediately.

export function useAIAnalysisProgressive(matchId, enabled = true) {
  return useQuery({
    queryKey: ['ai-analysis', matchId],
    queryFn: async () => {
      const { data } = await api.get(`/analysis/${matchId}/ai`, { timeout: 60000 });
      return data?.ai || null;
    },
    enabled: !!matchId && enabled,
    staleTime: 6 * 60 * 60 * 1000, // 6h matches DB cache TTL
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    retryDelay: 3000,
  });
}

// Legacy hook — kept for backward compat with older components
export function useAIAnalysis(matchId, fixture) {
  return useQuery({
    queryKey: ['ai-analysis-legacy', matchId],
    queryFn: async () => {
      const { data } = await api.post(`/ai/analyze/${matchId}`, { fixture }, { timeout: 30000 });
      return data;
    },
    enabled: !!matchId && !!fixture,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

// ─── AI CHAT ────────────────────────────────────────────────────────

export function useAIChat() {
  return useMutation({
    mutationFn: async ({ message, context, history }) => {
      const { data } = await api.post('/ai/chat', { message, context, history });
      return data?.reply || 'No response';
    },
  });
}

// ─── BRIEFING ───────────────────────────────────────────────────────

export function useBriefing(fixtures) {
  const hasFixtures = Array.isArray(fixtures) && fixtures.length > 0;

  return useQuery({
    queryKey: ['briefing', hasFixtures ? fixtures.length : 0],
    queryFn: async () => {
      const { data } = await api.post('/ai/briefing', { fixtures: fixtures || [] });
      return data;
    },
    // Only fire when we actually have fixture data
    enabled: hasFixtures,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ─── STANDINGS ──────────────────────────────────────────────────────

export function useStandings(leagueCode) {
  return useQuery({
    queryKey: ['standings', leagueCode],
    queryFn: async () => {
      const { data } = await api.get(`/leagues/${leagueCode}/standings`);
      return data;
    },
    enabled: !!leagueCode,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

// ─── STATUS ─────────────────────────────────────────────────────────

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const { data } = await api.get('/status');
      return data;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
}

// ─── ODDS (NEW: OUTCOME-GROUPED MARKETS) ─────────────────────────

export function useMarkets(fixtureId) {
  return useQuery({
    queryKey: ['markets', fixtureId],
    queryFn: async () => {
      const { data } = await api.get(`/odds/${fixtureId}/markets`);
      return data?.data || [];
    },
    enabled: !!fixtureId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// Legacy hooks — kept for backward compatibility
export function useOdds(fixtureId) {
  return useQuery({
    queryKey: ['odds', fixtureId],
    queryFn: async () => {
      const { data } = await api.get(`/odds/${fixtureId}`);
      return data?.data || null;
    },
    enabled: !!fixtureId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useValueEdges(fixtureId) {
  return useQuery({
    queryKey: ['value-edges', fixtureId],
    queryFn: async () => {
      const { data } = await api.get(`/odds/${fixtureId}/value`);
      return data?.data || null;
    },
    enabled: !!fixtureId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// ─── DEMO APP BOOT (PARALLEL FETCH) ─────────────────────────────────
// Fetches all critical demo data in parallel for <1s perceived load

export function useAppBootData() {
  return useQuery({
    queryKey: ['app-boot'],
    queryFn: async () => {
      // Parallelize requests! No sequential chaining.
      const [demoStatus, demoDash, demoPreds] = await Promise.all([
        api.get('/demo/status').catch(() => ({ data: { system: { demoMode: true } } })),
        api.get('/demo/dashboard').catch(() => ({ data: { dashboard: null } })),
        api.get('/demo/predictions').catch(() => ({ data: { data: { matches: [] } } }))
      ]);

      return {
        status: demoStatus.data,
        dashboard: demoDash.data.dashboard,
        predictions: demoPreds.data.data?.matches || [],
      };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export { api };
