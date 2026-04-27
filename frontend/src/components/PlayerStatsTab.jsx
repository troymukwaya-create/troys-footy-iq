import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getTeamColor, getColor, DRAW_COLOR } from '../constants/teamColors.js';

export function PlayerStatsTab({ fixtureId, homeTeam, awayTeam }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPlayers() {
      setLoading(true);
      try {
        const res = await axios.get(`/api/fixtures/${fixtureId}/players`);
        setData(res.data);
      } catch {
        setData(null);
      }
      setLoading(false);
    }
    loadPlayers();
  }, [fixtureId]);

  if (loading) return <div style={{ color: '#6B7280', fontSize: 13, padding: 16 }}>Loading player performance...</div>;
  if (!data || !data.home) return <div style={{ color: '#6B7280', fontSize: 13, padding: 16 }}>No player data available for this fixture.</div>;

  const hColor = getColor(homeTeam?.name).primary;
  const aColor = getColor(awayTeam?.name).primary;

  const PlayerRow = ({ p, color }) => {
    let rc = '#4B5563'; // gray
    if (p.rating >= 8) rc = color;
    else if (p.rating >= 6.0) rc = '#F59E0B'; // amber

    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1f1f1f', fontSize: 12 }}>
        <div style={{ width: 24, color: '#6B7280' }}>{p.position}</div>
        <div style={{ flex: 1, color: '#F9FAFB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {p.name}
          {p.events?.includes('yellow') && <span style={{fontSize:10}}>🟨</span>}
          {p.events?.includes('red') && <span style={{fontSize:10}}>🟥</span>}
          {p.events?.find(e=>e.startsWith('goal')) && <span style={{fontSize:10}}>⚽</span>}
          {p.events?.find(e=>e.startsWith('subOff')) && <span style={{fontSize:10, color:'#EF4444'}}>↓{p.events.find(e=>e.startsWith('subOff')).split(':')[1]}'</span>}
          {p.events?.find(e=>e.startsWith('subOn')) && <span style={{fontSize:10, color:'#22C55E'}}>↑{p.events.find(e=>e.startsWith('subOn')).split(':')[1]}'</span>}
        </div>
        <div style={{ width: 30, textAlign: 'center', color: '#9CA3AF' }}>{p.minutes}'</div>
        <div style={{ width: 24, textAlign: 'center', color: '#9CA3AF' }}>{p.goals}</div>
        <div style={{ width: 24, textAlign: 'center', color: '#9CA3AF' }}>{p.assists}</div>
        <div style={{ width: 40, textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: rc, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 10 }}>
            {p.rating && typeof p.rating === 'number' ? p.rating.toFixed(1) : '-'}
          </div>
        </div>
      </div>
    );
  };

  const TeamCol = ({ teamData, color }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 12, textTransform: 'uppercase' }}>{teamData.team}</div>
      <div style={{ display: 'flex', fontSize: 10, color: '#6B7280', paddingBottom: 6, borderBottom: '1px solid #2a2a2a' }}>
        <div style={{ width: 24 }}>POS</div>
        <div style={{ flex: 1 }}>PLAYER</div>
        <div style={{ width: 30, textAlign: 'center' }}>MIN</div>
        <div style={{ width: 24, textAlign: 'center' }}>G</div>
        <div style={{ width: 24, textAlign: 'center' }}>A</div>
        <div style={{ width: 40, textAlign: 'center' }}>RTG</div>
      </div>
      {teamData.starters?.map((p, i) => <PlayerRow key={`s-${i}`} p={p} color={color} />)}
      
      {teamData.subs?.length > 0 && (
        <div style={{ margin: '12px 0 8px', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>SUBSTITUTES</div>
      )}
      {teamData.subs?.map((p, i) => <PlayerRow key={`sub-${i}`} p={p} color={color} />)}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 24, padding: 16, background: '#111', borderRadius: 12, border: '1px solid #2a2a2a' }}>
      <TeamCol teamData={data.home} color={hColor} />
      <div style={{ width: 1, background: '#2a2a2a' }} />
      <TeamCol teamData={data.away} color={aColor} />
    </div>
  );
}
