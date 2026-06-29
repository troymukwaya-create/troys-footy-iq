// ─── PUBLIC PERFORMANCE DATA HOOK ───────────────────────────────────
// The /api/performance/* endpoints are PUBLIC (the honesty moat is public by
// design), so the admin pages read them with a plain client, not the admin one.

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const RAW = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW.endsWith('/api') ? RAW : `${RAW.replace(/\/+$/, '')}/api`;
const perfApi = axios.create({ baseURL: `${API_BASE}/performance`, timeout: 15000 });

export function usePerf(path, ms = 60000) {
  return useQuery({
    queryKey: ['perf', path],
    queryFn: () => perfApi.get(path).then(r => r.data?.data ?? r.data),
    refetchInterval: ms, staleTime: 0, retry: 0,
  });
}

export default usePerf;
