import React from 'react';
import { getColor } from '../constants/teamColors.js';
import { useStore } from '../store/useStore';

export function LeagueTabs() {
  const { activeLeague, setActiveLeague, fixtures } = useStore();

  const tabs = [
    { id: 'ALL', label: 'All Matches', flag: '🌍' },
    { id: 'PL', label: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'PD', label: 'La Liga', flag: '🇪🇸' },
    { id: 'BL1', label: 'Bundesliga', flag: '🇩🇪' },
    { id: 'SA', label: 'Serie A', flag: '🇮🇹' },
    { id: 'FL1', label: 'Ligue 1', flag: '🇫🇷' },
    { id: 'BSA', label: 'Brasileirão', flag: '🇧🇷' },
    { id: 'CL', label: 'Champions League', flag: '🇪🇺' },
  ];

  return (
    <div className="league-tabs" style={{ 
      display: 'flex', gap: 16, padding: '12px 16px', background: '#0a0a0a', 
      borderBottom: '1px solid #2a2a2a', overflowX: 'auto', flexShrink: 0
    }}>
      {tabs.map(t => {
        const count = t.id === 'ALL' 
          ? fixtures.length 
          : fixtures.filter(f => f.league?.code === t.id).length;
          
        const isActive = activeLeague === t.id;
        const color = isActive ? getColor().primary : (count === 0 ? '#4B5563' : '#9CA3AF');

        return (
          <button
            key={t.id}
            onClick={() => setActiveLeague(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color,
              padding: '6px 8px',
              borderBottom: isActive ? `2px solid ${getColor().primary}` : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontWeight: isActive ? 800 : 600,
              opacity: count === 0 ? 0.4 : 1,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>{t.flag}</span>
            <span>{t.label}</span>
            <span style={{ fontSize: 11, background: '#1a1a1a', padding: '2px 6px', borderRadius: 10 }}>{count}</span>
          </button>
        );
      })}
      
      <style>{`
        @media (max-width: 768px) { .league-tabs { padding: 8px; gap: 8px; } }
      `}</style>
    </div>
  );
}
