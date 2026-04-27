import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useRealTime() {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const {
    setLiveMatches, updateFixtureScore, addGoalFlash,
    updateMatchStats, updateStandings, setConnectionStatus
  } = useStore();

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        setConnectionStatus('connected');
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      };

      ws.current.onmessage = (event) => {
        const { type, payload } = JSON.parse(event.data);

        switch (type) {
          case 'INIT':
            // Seed all initial state from server
            if (payload.liveMatches) setLiveMatches(payload.liveMatches);
            if (payload.fixtures) useStore.getState().setFixtures(payload.fixtures);
            break;

          case 'LIVE_SCORES_UPDATE':
            setLiveMatches(payload);
            payload.forEach(m => updateFixtureScore(m.id, m.score, m.minute, m.status, m.probability));
            break;

          case 'GOAL_SCORED':
            // Flash notification + update score
            addGoalFlash(payload);
            updateFixtureScore(payload.fixtureId, payload.newScore, payload.minute, 'IN_PLAY');
            break;

          case 'MATCH_STARTED':
            useStore.getState().markMatchLive(payload.id);
            break;

          case 'MATCH_FINISHED':
            useStore.getState().markMatchFinished(payload);
            break;

          case 'MATCH_STATS_UPDATE':
            updateMatchStats(payload.fixtureId, payload.stats);
            break;

          case 'STANDINGS_UPDATE':
            updateStandings(payload.leagueCode, payload.standings);
            break;
        }
      };

      ws.current.onclose = () => {
        setConnectionStatus('disconnected');
        // Auto-reconnect after 5 seconds
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };

    } catch (err) {
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);
}
