import React, { useState } from 'react';

const LEAGUE_TREE = [
  { country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', leagues: [{ code: 'PL', name: 'Premier League' }, { code: 'ELC', name: 'Championship' }] },
  { country: 'Spain', flag: '🇪🇸', leagues: [{ code: 'PD', name: 'La Liga' }] },
  { country: 'Germany', flag: '🇩🇪', leagues: [{ code: 'BL1', name: 'Bundesliga' }] },
  { country: 'Italy', flag: '🇮🇹', leagues: [{ code: 'SA', name: 'Serie A' }] },
  { country: 'France', flag: '🇫🇷', leagues: [{ code: 'FL1', name: 'Ligue 1' }] },
  { country: 'Brazil', flag: '🇧🇷', leagues: [{ code: 'BSA', name: 'Brasileirão' }] },
  { country: 'UEFA', flag: '🇪🇺', leagues: [{ code: 'CL', name: 'Champions League' }, { code: 'EL', name: 'Europa League' }] },
  { country: 'Netherlands', flag: '🇳🇱', leagues: [{ code: 'ERE', name: 'Eredivisie' }] },
  { country: 'Portugal', flag: '🇵🇹', leagues: [{ code: 'PPL', name: 'Primeira Liga' }] },
];

export function LeagueSidebar({ fixtures = [], liveMatches = [], activeLeague, onSelectLeague, onGoDashboard }) {
  const [expanded, setExpanded] = useState({ England: true, Spain: true, UEFA: true });
  const toggle = (c) => setExpanded(prev => ({ ...prev, [c]: !prev[c] }));

  const liveCount = (liveMatches || []).length || (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Quick Filters */}
      <nav style={{ padding: '12px 8px 8px' }}>
        <FilterBtn active={activeLeague === 'ALL'} onClick={onGoDashboard} label="All Matches" />
        <FilterBtn
          active={activeLeague === 'LIVE'}
          onClick={() => onSelectLeague?.({ code: 'LIVE' })}
          label="Live"
          badge={liveCount > 0 ? liveCount : null}
          isLive
        />
        <FilterBtn active={activeLeague === 'TODAY'} onClick={() => onSelectLeague?.({ code: 'TODAY' })} label="Today" />
        <FilterBtn active={activeLeague === 'TOMORROW'} onClick={() => onSelectLeague?.({ code: 'TOMORROW' })} label="Tomorrow" />
      </nav>

      {/* Divider */}
      <div style={{ margin: '0 12px', borderTop: '1px solid var(--border-subtle)' }} />

      {/* League Groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', maxHeight: 220 }}>
        {LEAGUE_TREE.map(group => {
          const isExpanded = expanded[group.country] ?? false;
          return (
            <div key={group.country} style={{ marginBottom: 2 }}>
              <button
                onClick={() => toggle(group.country)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', padding: '6px 8px',
                  background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer',
                }}
              >
                <span style={{ marginRight: 8, fontSize: 13 }}>{group.flag}</span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {group.country}
                </span>
                <span style={{ fontSize: 8, opacity: 0.4, transition: 'transform 200ms', transform: isExpanded ? 'none' : 'rotate(-90deg)' }}>▼</span>
              </button>

              {isExpanded && group.leagues.map(league => {
                const active = activeLeague === league.code;
                const todayStr = new Date().toDateString();
                const count = (fixtures || []).filter(f =>
                  f.league?.code === league.code && new Date(f.date).toDateString() === todayStr
                ).length;

                return (
                  <button
                    key={league.code}
                    onClick={() => onSelectLeague?.(league)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '6px 12px 6px 32px', borderRadius: 'var(--radius-sm)',
                      background: active ? 'var(--accent-muted)' : 'transparent',
                      border: 'none', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                      color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      cursor: 'pointer', transition: 'all 150ms ease',
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>{league.name}</span>
                    {count > 0 && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 10,
                        background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-raised)',
                        color: active ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: 700,
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, badge, isLive }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 12px', borderRadius: 'var(--radius-md)',
        background: active ? 'var(--accent-muted)' : 'transparent',
        border: 'none', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
        transition: 'all 150ms ease', textAlign: 'left',
      }}
    >
      {isLive && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} className="animate-pulse" />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 700,
          background: 'var(--success-muted)', color: 'var(--success)',
          border: '1px solid rgba(34,197,94,0.20)',
        }}>{badge}</span>
      )}
    </button>
  );
}
