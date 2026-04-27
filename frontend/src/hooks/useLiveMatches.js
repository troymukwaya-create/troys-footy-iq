import { useEffect } from 'react';
import useStore from '../store/useStore';
import api from '../api/client';

export function useLiveMatches() {
  const { liveMatches, setLiveMatches } = useStore();

  useEffect(() => {
    let interval;
    const fetchLive = async () => {
      try {
        const { data } = await api.get('/fixtures/live');
        setLiveMatches(data);
      } catch (err) { console.error('Error fetching live matches', err); }
    };

    fetchLive();
    interval = setInterval(fetchLive, 30000); // 30s
    return () => clearInterval(interval);
  }, [setLiveMatches]);

  return liveMatches;
}
