import React from 'react';

// Compact, horizontally-scrolling filter rows — keeps the browse controls to a
// slim header so the fixture tiles below get the room (fixes the mobile
// "screen cut in half" problem).
const QUICK = [
  { code: 'ALL', label: 'All' },
  { code: 'WC', label: '🏆 World Cup', highlight: true },
  { code: 'LIVE', label: 'Live', live: true },
  { code: 'TODAY', label: 'Today' },
  { code: 'TOMORROW', label: 'Tomorrow' },
];

const LEAGUES = [
  { code: 'PL', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'PD', name: 'La Liga', flag: '🇪🇸' },
  { code: 'BL1', name: 'Bundesliga', flag: '🇩🇪' },
  { code: 'SA', name: 'Serie A', flag: '🇮🇹' },
  { code: 'FL1', name: 'Ligue 1', flag: '🇫🇷' },
  { code: 'CL', name: 'Champions League', flag: '🇪🇺' },
  { code: 'EL', name: 'Europa League', flag: '🇪🇺' },
  { code: 'BSA', name: 'Brasileirão', flag: '🇧🇷' },
  { code: 'ERE', name: 'Eredivisie', flag: '🇳🇱' },
  { code: 'PPL', name: 'Primeira Liga', flag: '🇵🇹' },
  { code: 'ELC', name: 'Championship', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
];

export function LeagueSidebar({ fixtures = [], liveMatches = [], activeLeague, onSelectLeague, onGoDashboard }) {
  const liveCount = (liveMatches || []).length || (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;
  const select = (code) => (code === 'ALL' ? onGoDashboard?.() : onSelectLeague?.({ code }));
  const todayStr = new Date().toDateString();

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0 8px' }}>
      <Row>
        {QUICK.map(q => (
          <Chip key={q.code} active={activeLeague === q.code} highlight={q.highlight} onClick={() => select(q.code)}>
            {q.live && (
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: activeLeague === q.code ? '#fff' : 'var(--success)' }} />
            )}
            {q.label}{q.live && liveCount > 0 ? ` · ${liveCount}` : ''}
          </Chip>
        ))}
      </Row>

      <Row style={{ marginTop: 6 }}>
        {LEAGUES.map(l => {
          const count = (fixtures || []).filter(f => f.league?.code === l.code && new Date(f.date).toDateString() === todayStr).length;
          return (
            <Chip key={l.code} active={activeLeague === l.code} onClick={() => select(l.code)}>
              <span style={{ marginRight: 5 }}>{l.flag}</span>{l.name}
              {count > 0 && (
                <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 8, background: activeLeague === l.code ? 'rgba(255,255,255,0.22)' : 'var(--bg-base)' }}>{count}</span>
              )}
            </Chip>
          );
        })}
      </Row>

      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

function Row({ children, style }) {
  return (
    <div
      className="hide-scrollbar"
      style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 12px', scrollbarWidth: 'none', msOverflowStyle: 'none', ...style }}
    >
      {children}
    </div>
  );
}

function Chip({ active, highlight, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap',
        padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontSize: 12,
        fontWeight: active ? 700 : 500,
        background: active ? 'var(--accent)' : highlight ? 'var(--accent-muted)' : 'var(--bg-raised)',
        color: active ? '#fff' : highlight ? 'var(--accent)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
        transition: 'all 150ms ease',
      }}
    >
      {children}
    </button>
  );
}
