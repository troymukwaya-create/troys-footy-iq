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

export function useFixtures() {
  return useQuery({
    queryKey: ['fixtures'],
    queryFn: async () => {
      const { data } = await api.get('/fixtures/all');
      const fixtures = Array.isArray(data) ? data : (data?.fixtures || []);
      const source = data?.source || 'api';
      return { fixtures, source };
    },
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

// ─── AI ANALYSIS (POST-based, for legacy route) ─────────────────────

export function useAIAnalysis(matchId, fixture) {
  return useQuery({
    queryKey: ['ai-analysis', matchId],
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

// ─── ODDS ────────────────────────────────────────────────────────────

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

export { api };
