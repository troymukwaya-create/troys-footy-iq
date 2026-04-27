import { useState, useEffect } from 'react';
import api from '../api/client';

export function useAIPicks() {
  const [todayPicks, setTodayPicks] = useState([]);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [today, hist] = await Promise.all([
          api.get('/ai/picks/today').catch(() => ({ data: [] })),
          api.get('/ai/picks/history').catch(() => ({ data: { picks: [], accuracy: 0, summary: {} } }))
        ]);
        setTodayPicks(today.data || []);
        setHistory(hist.data || null);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  return { todayPicks, history, loading };
}
