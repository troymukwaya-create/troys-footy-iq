import React from 'react';

export function CompetitionHeader({ league, matchCount, isCollapsed, onToggle }) {
  const LEAGUE_COLORS = {
    'PL': '#37003C', 'PD': '#FF4B44', 'BL1': '#D20515',
    'SA': '#1E4D8C', 'FL1': '#003189', 'BSA': '#009C3B', 'CL': '#001489',
  };
  const color = LEAGUE_COLORS[league.code] || '#FF6B35';

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px',
        background: '#111111', borderBottom: '1px solid #1f1f1f',
        cursor: 'pointer', userSelect: 'none',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#F9FAFB', flex: 1 }}>
        {league.name || league.code}
      </span>
      <span style={{ fontSize: 11, color: '#6B7280', marginRight: 8 }}>
        {matchCount} matches
      </span>
      <span style={{ fontSize: 12, color: '#4B5563', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
    </div>
  );
}
