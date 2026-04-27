import { useState, useEffect } from 'react';
import api from '../api/client';

export function useTeamStats(teamId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/teams/${teamId}`);
        setData(res.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch();
  }, [teamId]);

  return { data, loading };
}
