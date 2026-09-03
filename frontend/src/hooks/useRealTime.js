import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import api from '../api/client';

// WebSockets cannot be held open by serverless functions, so live state is
// polled. football-data.org's free tier serves delayed scores anyway, so a
// 60s poll loses nothing a socket would have delivered.
const POLL_MS = 60_000;

export function useRealTime() {
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const { setLiveMatches, updateFixtureScore, setConnectionStatus } =
        useStore.getState();
      try {
        const res = await api.get('/fixtures/live');
        if (cancelled) return;
        const body = res?.data;
        const live = Array.isArray(body) ? body
          : Array.isArray(body?.data) ? body.data
          : [];
        setLiveMatches(live);
        live.forEach((m) =>
          updateFixtureScore(m.id, m.score, m.minute, m.status, m.probability)
        );
        setConnectionStatus('connected');
      } catch {
        if (!cancelled) setConnectionStatus('disconnected');
      }
    }

    poll();
    timer.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
}
