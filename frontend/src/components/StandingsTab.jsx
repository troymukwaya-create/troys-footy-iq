import React, { useEffect, useState } from 'react';
import { getTeamColor, getColor, DRAW_COLOR } from '../constants/teamColors.js';
import axios from 'axios';
import { useStore } from '../store/useStore';

export function StandingsTab() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeLeague = useStore(state => state.activeLeague);

  useEffect(() => {
    async function loadStandings() {
      if (activeLeague === 'ALL') return;
      setLoading(true);
      try {
        const res = await axios.get(`/api/leagues/${activeLeague}/standings`);
        if (res.data?.standings?.[0]?.table) {
          setStandings(res.data.standings[0].table);
        } else {
          // If fallback demo structure
          setStandings(res.data.table || []);
        }
      } catch (err) {
        setStandings([]);
      }
      setLoading(false);
    }
    loadStandings();
  }, [activeLeague]);

  if (activeLeague === 'ALL') {
    return <div style={{ color: '#9CA3AF', padding: 20 }}>Select a specific league tab above to view standings.</div>;
  }

  if (loading) {
    return <div style={{ color: '#9CA3AF', padding: 20 }}>Loading standings...</div>;
  }

  return (
    <div style={{ background: '#1a0a0a', border: '1px solid #2a2a2a', borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#111', color: '#6B7280', textAlign: 'center', borderBottom: '1px solid #2a2a2a' }}>
            <th style={{ padding: '12px 16px', textAlign: 'left' }}># Team</th>
            <th style={{ padding: '12px 8px' }}>P</th>
            <th style={{ padding: '12px 8px' }}>W</th>
            <th style={{ padding: '12px 8px' }}>D</th>
            <th style={{ padding: '12px 8px' }}>L</th>
            <th style={{ padding: '12px 8px' }}>GD</th>
            <th style={{ padding: '12px 8px', fontWeight: 800, color: '#F9FAFB' }}>Pts</th>
            <th style={{ padding: '12px 16px' }}>Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(row => {
            const form = row.form || 'W,D,L,W,W';
            const results = form.split(',');
            // Map form to sparkline points
            const points = [];
            let current = 10; // Start middle
            results.forEach((r, i) => {
              if (r === 'W') current += 2;
              else if (r === 'L') current -= 2;
              points.push(`${i * 10},${20 - current}`);
            });
            const pathData = `M${points.join(' L')}`;
            const lastResult = results[results.length-1];
            const strokeColor = lastResult === 'W' ? getColor(row.team.name).primary : lastResult === 'L' ? '#3d0000' : DRAW_COLOR;

            return (
              <tr key={row.team.id} style={{ borderBottom: '1px solid #2a2a2a', color: '#F9FAFB', textAlign: 'center' }}>
                <td style={{ padding: '12px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#6B7280', width: 20 }}>{row.position}</span>
                  <img src={row.team.crest} alt="" style={{ width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600 }}>{row.team.name}</span>
                </td>
                <td style={{ padding: '12px 8px' }}>{row.playedGames}</td>
                <td style={{ padding: '12px 8px' }}>{row.won}</td>
                <td style={{ padding: '12px 8px' }}>{row.draw}</td>
                <td style={{ padding: '12px 8px' }}>{row.lost}</td>
                <td style={{ padding: '12px 8px' }}>{row.goalDifference}</td>
                <td style={{ padding: '12px 8px', fontWeight: 800, color: getColor(row.team.name).primary }}>{row.points}</td>
                <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {results.map((r, i) => (
                      <div key={i} style={{ width: 12, height: 12, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, background: r === 'W' ? getColor(row.team.name).primary : r === 'D' ? DRAW_COLOR : '#3d0000', color: '#fff', fontWeight: 800 }}>
                        {r}
                      </div>
                    ))}
                  </div>
                  <svg width="40" height="20" viewBox="0 0 40 20" style={{ overflow: 'visible' }}>
                    <path d={pathData} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
