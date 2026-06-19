import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { FixtureCard } from './FixtureCard.jsx';

// Freshness-first fixture list. The old left panel sorted ascending by date, so
// finished games piled on top and you scrolled down to find what's live/next.
// Now: LIVE → UP NEXT (grouped by day) → RESULTS (collapsed at the bottom).
// Shared by the Matches panel and the team page so both behave the same.

const isLive = (f) => f.status === 'IN_PLAY' || f.status === 'PAUSED';
const isFinished = (f) => f.status === 'FINISHED';

function dateLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function SectionLabel({ children, accent, live }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 8 }}>
      {live && <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />}
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: accent || 'var(--text-tertiary)' }}>{children}</span>
    </div>
  );
}

export function FixtureList({ fixtures = [], selectedId, onSelect, onPrefetch, emptyLabel = 'No fixtures' }) {
  const [showResults, setShowResults] = useState(false);

  const { live, upcomingByDate, finished } = useMemo(() => {
    const live = [], upcoming = [], finished = [];
    for (const f of fixtures) {
      if (isLive(f)) live.push(f);
      else if (isFinished(f)) finished.push(f);
      else upcoming.push(f);
    }
    live.sort((a, b) => new Date(a.date) - new Date(b.date));
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    finished.sort((a, b) => new Date(b.date) - new Date(a.date)); // most recent first

    const byDate = {};
    for (const f of upcoming) {
      const key = f.date ? new Date(f.date).toDateString() : 'Scheduled';
      (byDate[key] ||= []).push(f);
    }
    const upcomingByDate = Object.entries(byDate).sort(([a], [b]) => new Date(a) - new Date(b));
    return { live, upcomingByDate, finished };
  }, [fixtures]);

  const card = (f) => (
    <FixtureCard
      key={f.id}
      fixture={f}
      isSelected={selectedId === f.id}
      onClick={() => onSelect?.(f)}
      onMouseEnter={onPrefetch ? () => onPrefetch(f.id) : undefined}
    />
  );

  const nothing = !live.length && !upcomingByDate.length && !finished.length;
  if (nothing) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div>
      {live.length > 0 && (
        <div className="animate-fade-in" style={{ marginBottom: 16 }}>
          <SectionLabel live accent="var(--success)">Live now · {live.length}</SectionLabel>
          {live.map(card)}
        </div>
      )}

      {upcomingByDate.length > 0 && upcomingByDate.map(([dateStr, dayFixtures], idx) => (
        <div key={dateStr} className="animate-fade-in" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 8 }}>
            {idx === 0 && <Clock size={12} style={{ color: 'var(--text-tertiary)' }} />}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: dateLabel(dateStr) === 'Today' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
              {idx === 0 ? 'Up next · ' : ''}{dateLabel(dateStr)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{dayFixtures.length}</span>
          </div>
          {dayFixtures.map(card)}
        </div>
      ))}

      {finished.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <button
            onClick={() => setShowResults(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '9px 10px', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
            }}
          >
            {showResults ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            Results &amp; settled calls
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{finished.length}</span>
          </button>
          {showResults && (
            <div className="animate-fade-in" style={{ marginTop: 8 }}>
              {finished.map(card)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FixtureList;
