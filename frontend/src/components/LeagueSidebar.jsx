import React from 'react';
import { Trophy, Globe } from 'lucide-react';

// Compact, horizontally-scrolling filter rows — keeps the browse controls to a
// slim header so the fixture tiles below get the room (fixes the mobile
// "screen cut in half" problem).
// Pills use REAL flag images (same source as the tile bleeds) and proper
// icons — emoji render differently on every OS and read as a prototype.
const QUICK = [
  { code: 'ALL', label: 'All' },
  { code: 'WC', label: 'World Cup', icon: Trophy, highlight: true },
  { code: 'LIVE', label: 'Live', live: true },
  { code: 'TODAY', label: 'Today' },
  { code: 'TOMORROW', label: 'Tomorrow' },
];

const LEAGUES = [
  { code: 'FR', name: 'Int. Friendlies', icon: Globe },
  { code: 'PL', name: 'Premier League', iso: 'gb-eng' },
  { code: 'PD', name: 'La Liga', iso: 'es' },
  { code: 'BL1', name: 'Bundesliga', iso: 'de' },
  { code: 'SA', name: 'Serie A', iso: 'it' },
  { code: 'FL1', name: 'Ligue 1', iso: 'fr' },
  { code: 'CL', name: 'Champions League', iso: 'eu' },
  { code: 'EL', name: 'Europa League', iso: 'eu' },
  { code: 'BSA', name: 'Brasileirão', iso: 'br' },
  { code: 'ERE', name: 'Eredivisie', iso: 'nl' },
  { code: 'PPL', name: 'Primeira Liga', iso: 'pt' },
  { code: 'ELC', name: 'Championship', iso: 'gb-eng' },
];

function PillFlag({ iso }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt=""
      loading="lazy"
      style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

export function LeagueSidebar({ fixtures = [], liveMatches = [], activeLeague, onSelectLeague, onGoDashboard }) {
  const liveCount = (liveMatches || []).length || (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;
  // Every chip (incl. "All") routes through onSelectLeague so the URL drives
  // the filter — keeps Back/Forward + the All-chip highlight working.
  const select = (code) => onSelectLeague?.({ code });
  const todayStr = new Date().toDateString();

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0 8px' }}>
      <Row>
        {QUICK.map(q => (
          <Chip key={q.code} active={activeLeague === q.code} highlight={q.highlight} onClick={() => select(q.code)}>
            {q.live && (
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: activeLeague === q.code ? '#fff' : 'var(--success)' }} />
            )}
            {q.icon && <q.icon size={12} style={{ flexShrink: 0 }} />}
            {q.label}{q.live && liveCount > 0 ? ` · ${liveCount}` : ''}
          </Chip>
        ))}
      </Row>

      <Row style={{ marginTop: 6 }}>
        {LEAGUES.map(l => {
          const count = (fixtures || []).filter(f => f.league?.code === l.code && new Date(f.date).toDateString() === todayStr).length;
          return (
            <Chip key={l.code} active={activeLeague === l.code} onClick={() => select(l.code)}>
              {l.icon ? <l.icon size={12} style={{ flexShrink: 0 }} /> : <PillFlag iso={l.iso} />}
              {l.name}
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
