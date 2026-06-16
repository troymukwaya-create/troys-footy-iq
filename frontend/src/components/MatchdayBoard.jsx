// ─── THE MATCHDAY BOARD ──────────────────────────────────────────────
// Screen zero during a tournament: today's matches as a live board.
// Each row = real flag bleed + three probability bars + kickoff
// countdown + lock status + one-line verdict, expanding IN PLACE into a
// receipt-style panel (scoreline lean, why, model vs market). Telemetry
// proved nobody navigates to match pages — so value must live in the
// row itself. Deep page stays one tap away inside the expanded panel.

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import FlagBleed, { hasFlags } from './FlagBleed.jsx';
import { getMatchColor } from '../constants/nationColors.js';
import { track } from '../lib/analytics.js';

const MONO = 'var(--font-mono)';
const mono = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

const isLiveStatus = (s) => s === 'IN_PLAY' || s === 'PAUSED';
const isDoneStatus = (s) => s === 'FINISHED' || s === 'FT';

function sameLocalDay(d, ref = new Date()) {
  const x = new Date(d);
  return x.getFullYear() === ref.getFullYear() && x.getMonth() === ref.getMonth() && x.getDate() === ref.getDate();
}

// "in 3h 12m" / "in 41m" — recomputed on a 30s tick.
function untilLabel(date, now) {
  const ms = new Date(date) - now;
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `in ${m}m`;
  if (m < 48 * 60) return `in ${Math.floor(m / 60)}h ${m % 60}m`;
  return `in ${Math.floor(m / 1440 / 60) || Math.floor(m / 1440)}d`;
}

// One line the model would actually say about this match.
function verdictLine(f) {
  const p = f.probability?.probabilities;
  if (!p) return null;
  const home = f.homeTeam?.name || 'Home';
  const away = f.awayTeam?.name || 'Away';
  const ve = f.probability?.valueEdges;
  if (ve) {
    const best = [
      { e: ve.home ?? -99, who: home },
      { e: ve.draw ?? -99, who: 'the draw' },
      { e: ve.away ?? -99, who: away },
    ].sort((a, b) => b.e - a.e)[0];
    if (best.e >= 5) return `Market underrates ${best.who} by ${Math.round(best.e)} pts`;
  }
  const max = Math.max(p.home, p.draw, p.away);
  if (p.home >= 65) return `${home} should win this`;
  if (p.away >= 65) return `${away} to win, and it isn't close`;
  if (max < 40) return 'A genuine three-way coin flip';
  if (p.draw >= 30) return `Draw-heavy — ${Math.round(p.draw)}% against a ~25% baseline`;
  return p.home > p.away ? `${home} edge it, no formality` : `${away} favoured — rarer than it sounds`;
}

// valueEdge = model − market (percentage points) → market implied %.
function marketImplied(p, ve, key) {
  if (!p || !ve || ve[key] == null) return null;
  return Math.max(0, Math.min(100, p[key] - ve[key]));
}

function ProbBars({ f, compact }) {
  const p = f.probability?.probabilities;
  if (!p) return null;
  const homeBar = getMatchColor(f.homeTeam?.name);
  const awayBar = getMatchColor(f.awayTeam?.name);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: compact ? 10.5 : 11.5, color: 'var(--text-secondary)', ...mono }}>
        <span>H <strong style={{ color: 'var(--text-primary)' }}>{Math.round(p.home)}%</strong></span>
        <span>D <strong style={{ color: 'var(--text-primary)' }}>{Math.round(p.draw)}%</strong></span>
        <span>A <strong style={{ color: 'var(--text-primary)' }}>{Math.round(p.away)}%</strong></span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', display: 'flex', overflow: 'hidden', borderRadius: 2 }}>
        <div style={{ width: `${p.home}%`, background: homeBar }} />
        <div style={{ width: `${p.draw}%`, background: 'rgba(255,255,255,0.16)' }} />
        <div style={{ width: `${p.away}%`, background: awayBar }} />
      </div>
    </div>
  );
}

// The expanded receipt — everything worth knowing without leaving the board.
function ReceiptPanel({ f, onSelect }) {
  const p = f.probability?.probabilities;
  const ve = f.probability?.valueEdges;
  const tops = (f.probability?.topScorelines || []).slice(0, 3);
  const home = f.homeTeam?.name || 'Home';
  const away = f.awayTeam?.name || 'Away';
  const rows = p ? [
    { label: `${home} win`, key: 'home' },
    { label: 'Draw', key: 'draw' },
    { label: `${away} win`, key: 'away' },
  ] : [];

  return (
    <div style={{ borderTop: '1px dashed var(--border-strong)', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(7,7,8,0.55)' }}>
      {/* model vs market table */}
      {p && (
        <div>
          <div style={{ ...mono, fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
            OUR NUMBER VS THE MARKET
          </div>
          {rows.map(({ label, key }) => {
            const mkt = marketImplied(p, ve, key);
            const diff = mkt != null ? p[key] - mkt : null;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0', fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
                <span aria-hidden style={{ flex: 1, borderBottom: '1px dotted var(--border-strong)', transform: 'translateY(-3px)' }} />
                <span style={{ ...mono, color: 'var(--text-primary)', fontWeight: 600 }}>{p[key].toFixed(1)}%</span>
                {mkt != null && (
                  <span style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    mkt {mkt.toFixed(1)}%
                    {diff != null && Math.abs(diff) >= 1 && (
                      <strong style={{ color: diff > 0 ? 'var(--success)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                        {' '}{diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </strong>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* scoreline lean */}
      {tops.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...mono, fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--text-tertiary)' }}>SCORELINE LEAN</span>
          {tops.map((s, i) => (
            <span key={s.score} style={{ ...mono, fontSize: 12.5, color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === 0 ? 700 : 400 }}>
              {s.score} <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{Math.round(s.probability)}%</span>
            </span>
          ))}
        </div>
      )}

      {/* why, in one sentence */}
      {verdictLine(f) && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--accent)', marginRight: 7 }}>›</span>
          {verdictLine(f)}.
          {f.probability?.riskLevel && (
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' '}{f.probability.riskLevel === 'LOW' ? "We're confident." : f.probability.riskLevel === 'HIGH' ? 'A coin flip — and we say so.' : 'We lean this way.'}
            </span>
          )}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onSelect?.(f); }}
        style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', background: 'transparent', cursor: 'pointer',
          border: '1px solid var(--border-strong)', borderRadius: 4,
          ...mono, fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-primary)',
        }}
      >
        FULL ANALYSIS <ArrowRight size={13} style={{ color: 'var(--accent)' }} />
      </button>
    </div>
  );
}

function BoardRow({ f, now, onSelect }) {
  const [open, setOpen] = useState(false);
  const p = f.probability?.probabilities;
  const live = isLiveStatus(f.status);
  const done = isDoneStatus(f.status);
  const locked = !!f.probability?.locked;
  const until = untilLabel(f.date, now);
  const ko = f.date ? new Date(f.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const useBleed = hasFlags(f.homeTeam?.name, f.awayTeam?.name);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) track('board_expand', { fixture_id: f.id, home_team: f.homeTeam?.name, away_team: f.awayTeam?.name });
  };

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 6, overflow: 'hidden', isolation: 'isolate', position: 'relative', background: '#0B0B0D' }}>
      <div
        role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        style={{ position: 'relative', isolation: 'isolate', padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {useBleed && <FlagBleed home={f.homeTeam?.name} away={f.awayTeam?.name} opacity={open ? 0.66 : 0.56} />}

        {/* status line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
          {live ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success)', fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
              LIVE {f.minute ? `${f.minute}′` : ''}
            </span>
          ) : done ? (
            <span style={{ fontWeight: 600 }}>FT {f.score?.home ?? f.fullTime?.home ?? ''}–{f.score?.away ?? f.fullTime?.away ?? ''}</span>
          ) : (
            <span>KICKOFF {ko}{until ? ` · ${until}` : ''}</span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {!done && (locked ? (
              <span style={{ color: 'var(--accent)', fontWeight: 600, border: '1px solid rgba(168,52,74,0.45)', padding: '1.5px 7px', borderRadius: 3 }}>LOCKED</span>
            ) : !live && (
              <span>LOCKS T-10</span>
            ))}
            <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }} />
          </span>
        </div>

        {/* teams */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 'clamp(14.5px, 3.9vw, 17px)', fontWeight: 700, color: 'var(--text-primary)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.homeTeam?.name}</span>
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontSize: '0.8em' }}>v</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.awayTeam?.name}</span>
          {f.venue && <span style={{ ...mono, marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }} className="board-venue">{f.venue}</span>}
        </div>

        <ProbBars f={f} />

        {/* one-line verdict (collapsed only — the panel says it with context) */}
        {!open && verdictLine(f) && (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--accent)', marginRight: 6 }}>›</span>{verdictLine(f)}
          </div>
        )}
      </div>

      {open && <ReceiptPanel f={f} onSelect={onSelect} />}
      <style>{`@media (max-width: 560px) { .board-venue { display: none; } }`}</style>
    </div>
  );
}

export function MatchdayBoard({ fixtures = [], onSelect }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { rows, isToday } = useMemo(() => {
    const usable = (fixtures || []).filter(f => f.homeTeam?.name && f.awayTeam?.name && f.date && f.probability?.probabilities);
    const today = usable
      .filter(f => sameLocalDay(f.date) || isLiveStatus(f.status))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (today.length) return { rows: today, isToday: true };
    // Quiet day → show the next matchday so the board is never empty.
    const future = usable
      .filter(f => new Date(f.date) > new Date() && !isDoneStatus(f.status))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDay = future[0] ? new Date(future[0].date) : null;
    return {
      rows: firstDay ? future.filter(f => sameLocalDay(f.date, firstDay)) : [],
      isToday: false,
    };
  }, [fixtures, now]);

  if (!rows.length) return null;

  const dayLabel = new Date(rows[0].date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section aria-label="Matchday board">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h1 className="font-display" style={{ fontSize: 'clamp(19px, 5vw, 24px)', fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
          {isToday ? "Today's board" : 'Next matchday'}
        </h1>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
          {dayLabel} · {rows.length} {rows.length === 1 ? 'match' : 'matches'} · every call locked T-10
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(f => <BoardRow key={f.id} f={f} now={now} onSelect={onSelect} />)}
      </div>
    </section>
  );
}

export default MatchdayBoard;
