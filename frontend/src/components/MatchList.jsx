import React, { useState } from 'react';
import { CompetitionHeader } from './CompetitionHeader';
import { MatchRow } from './MatchRow';
import { useStore } from '../store/useStore';

const CENTER_TABS = ['All Matches', 'Live', 'Today', 'Tomorrow', 'Outrights'];

export function MatchList({ fixtures, onSelect }) {
  const [activeTab, setActiveTab] = useState('All Matches');
  const [collapsed, setCollapsed] = useState({});

  const toggle = (leagueCode) => setCollapsed(prev => ({ ...prev, [leagueCode]: !prev[leagueCode] }));

  // Filter fixtures based on active tab
  const todayStr = new Date().toDateString();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toDateString();

  const filtered = fixtures.filter(f => {
    if (activeTab === 'All Matches') return true;
    if (activeTab === 'Live') return f.status === 'IN_PLAY' || f.status === 'PAUSED';
    if (activeTab === 'Today') return new Date(f.date).toDateString() === todayStr;
    if (activeTab === 'Tomorrow') return new Date(f.date).toDateString() === tomorrowStr;
    return true;
  });

  // Group by competition
  const groups = {};
  filtered.forEach(f => {
    const code = f.league?.code || 'OTHER';
    if (!groups[code]) groups[code] = { league: f.league || { code: 'OTHER', name: 'Other Competitions' }, matches: [] };
    groups[code].matches.push(f);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Center Tab Bar */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#0a0a0a', padding: '0 16px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        {CENTER_TABS.map(tab => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: isActive ? `2px solid #FF6B35` : '2px solid transparent',
                color: isActive ? '#fff' : '#9CA3AF',
                padding: '16px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
            >
              {tab === 'Live' ? <span style={{ color: '#22C55E' }}>● LIVE</span> : tab}
            </button>
          );
        })}
      </div>

      {/* Column Headers Sticky */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', position: 'sticky', top: 0, zIndex: 10 }}>
         <div style={{ width: 52, fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>TIME</div>
         <div style={{ flex: 1, padding: '0 12px', fontSize: 10, color: '#6B7280', fontWeight: 700 }}>MATCH</div>
         <div style={{ width: 60, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>HOME</div>
         <div style={{ width: 60, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>DRAW</div>
         <div style={{ width: 60, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>AWAY</div>
         <div style={{ width: 52, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>O2.5</div>
         <div style={{ width: 52, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>U2.5</div>
         <div style={{ width: 52, marginLeft: 4, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>BTTS</div>
         <div style={{ width: 44, marginLeft: 8, textAlign: 'center', fontSize: 10, color: '#6B7280', fontWeight: 700, flexShrink: 0 }}>MKTS</div>
      </div>

      {/* Match List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
        {Object.values(groups).map(group => {
          const isCollapsed = collapsed[group.league.code];
          return (
            <div key={group.league.code}>
              <CompetitionHeader 
                league={group.league} 
                matchCount={group.matches.length} 
                isCollapsed={isCollapsed} 
                onToggle={() => toggle(group.league.code)} 
              />
              {!isCollapsed && group.matches.map(f => (
                <MatchRow key={f.id} fixture={f} onSelect={() => onSelect(f)} isSelected={false} />
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
            No matches found for {activeTab}.
          </div>
        )}
      </div>
    </div>
  );
}
