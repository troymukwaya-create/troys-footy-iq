// ─── THE MATCHDAY BOARD ──────────────────────────────────────────────
// Screen zero during a tournament: today's matches as a live board.
// Each row = real flag bleed + three probability bars + kickoff
// countdown + lock status + one-line verdict, expanding IN PLACE into a
// receipt-style panel (scoreline lean, why, model vs market). Telemetry
// proved nobody navigates to match pages — so value must live in the
// row itself. Deep page stays one tap away inside the expanded panel.

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { track } from '../lib/analytics.js';
import { scorelineSummary } from '../lib/scoreline.js';
import { T } from './fixture/primitives.jsx';
import { fixtureView } from './fixture/oddData.js';
import { MatchOfDay, MatchBand } from './fixture/homeCards.jsx';

const MONO = 'var(--font-mono)';
const mono = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

// Shared broadcast-card tweaks — nation colours, max density, the subtle
// flag-bleed behind the body. Mirrors the approved Fixture Cards settings so
// the home hero/bands never disagree with the sidebar's Ticket cards.
const CARD_T = { accent: T.accent, colorMode: 'nation', density: 5, flagBg: true };

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
  return `in ${Math.floor(m / 1440)}d`;
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
  const [hover, setHover] = useState(false);
  const v = buildView(f, now);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) track('board_expand', { fixture_id: f.id, home_team: f.homeTeam?.name, away_team: f.awayTeam?.name });
  };

  if (!v) return null;
  return (
    <div style={{ border: '1px solid ' + (hover || open ? 'var(--border-strong)' : 'var(--border-default)'), borderRadius: 14, overflow: 'hidden', isolation: 'isolate', position: 'relative', background: T.raised, transition: 'border-color 180ms ease' }}>
      <div
        role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ cursor: 'pointer' }}
      >
        <MatchBand v={v} t={CARD_T} />
      </div>
      {open && <ReceiptPanel f={f} onSelect={onSelect} />}
    </div>
  );
}

// Largest model-vs-market disagreement on a fixture (our "edge"), in points.
function bestEdgeOf(f) {
  const ve = f.probability?.valueEdges;
  return ve ? Math.max(ve.home ?? -99, ve.draw ?? -99, ve.away ?? -99) : -99;
}

// Build the broadcast `v` state-view the home cards (MatchOfDay / MatchBand)
// consume: the fixtureView base + the board-computed extras. untilLabel returns
// null for live/finished fixtures, so the countdown is guarded before upper-casing.
function buildView(f, now) {
  const v = fixtureView(f);
  if (!v) return null;
  const live = isLiveStatus(f.status);
  const done = isDoneStatus(f.status);
  const locked = !!f.probability?.locked;
  const cd = untilLabel(f.date, now);
  const bestEdge = bestEdgeOf(f);
  const sl = scorelineSummary(f.probability);
  return {
    ...v,
    venue: f.venue || '',
    countdown: (!live && !done && cd) ? cd.toUpperCase() : null,
    insight: verdictLine(f),
    edge: bestEdge >= 5 ? `+${Math.round(bestEdge)} PTS VS MARKET` : null,
    lock: done ? null : (locked ? 'LOCKED' : (live ? null : 'LOCKS T-10')),
    scoreCall: sl?.confident ? `${sl.score} likely` : null,
  };
}

function greetingFor(now) {
  const h = now.getHours();
  if (h < 12) return 'Good morning.';
  if (h < 18) return 'Good afternoon.';
  return 'Good evening.';
}

// ─── MATCH OF THE DAY (featured hero) ────────────────────────────────
// The one game to look at — our biggest market disagreement, or the next to
// kick off when nothing stands out. The broadcast hero from the Home design.
function HeroMatch({ f, now, onSelect }) {
  const v = buildView(f, now);
  if (!v) return null;
  return <MatchOfDay v={v} t={CARD_T} onSelect={() => onSelect?.(f)} />;
}

// ─── THE HOME BOARD ──────────────────────────────────────────────────
// Welcoming + freshness-first: greeting → Match of the day → Live now →
// Up next → Today's results (collapsed). The old board sorted ascending so
// games finished earlier today (and stale-cached past games) sat on top;
// now what's live or next always leads, and finished games tuck away.
export function MatchdayBoard({ fixtures = [], onSelect }) {
  const [now, setNow] = useState(() => new Date());
  const [showResults, setShowResults] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { live, slate, hero, finishedToday, isToday, slateDayLabel } = useMemo(() => {
    const usable = (fixtures || []).filter(f => f.homeTeam?.name && f.awayTeam?.name && f.date && f.probability?.probabilities);
    const live = usable.filter(f => isLiveStatus(f.status)).sort((a, b) => new Date(a.date) - new Date(b.date));
    const todayUp = usable.filter(f => sameLocalDay(f.date) && !isDoneStatus(f.status) && !isLiveStatus(f.status))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const finishedToday = usable.filter(f => sameLocalDay(f.date) && isDoneStatus(f.status))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    let slate = todayUp, isToday = true, slateDayLabel = null;
    if (!slate.length) {
      // Quiet day → look ahead to the next matchday so Home is never empty.
      const future = usable.filter(f => new Date(f.date) > now && !isDoneStatus(f.status))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const firstDay = future[0] ? new Date(future[0].date) : null;
      slate = firstDay ? future.filter(f => sameLocalDay(f.date, firstDay)) : [];
      isToday = false;
      slateDayLabel = firstDay ? firstDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : null;
    }

    // Match of the day: biggest edge among what's still to come (or live);
    // if nothing stands out, the next game to kick off.
    const candidates = [...live, ...slate];
    let hero = null;
    if (candidates.length) {
      const byEdge = candidates.slice().sort((a, b) => bestEdgeOf(b) - bestEdgeOf(a));
      hero = bestEdgeOf(byEdge[0]) >= 5 ? byEdge[0] : (slate[0] || live[0]);
    }
    return { live, slate, hero, finishedToday, isToday, slateDayLabel };
  }, [fixtures, now]);

  if (!live.length && !slate.length && !finishedToday.length) return null;

  const heroId = hero?.id;
  const liveRows = live.filter(f => f.id !== heroId);
  const slateRows = slate.filter(f => f.id !== heroId);
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const statusBits = [];
  if (live.length) statusBits.push(`${live.length} live now`);
  if (isToday && slate.length) statusBits.push(`${slate.length} still to come`);
  if (!isToday && slateDayLabel) statusBits.push(`next games ${slateDayLabel}`);
  statusBits.push('read the game.');

  return (
    <section aria-label="Home board">
      <div className="animate-fade-in" style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: MONO, fontSize: 'clamp(24px, 6vw, 38px)', fontWeight: 600, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.05, color: 'var(--text-primary)' }}>
          {greetingFor(now)}
        </h1>
        <p style={{ fontFamily: MONO, fontSize: 'clamp(11px, 2.6vw, 12.5px)', letterSpacing: '0.02em', color: 'var(--text-tertiary)', margin: '12px 0 0' }}>
          {dateStr} · {statusBits.join(' · ')}
        </p>
      </div>

      {hero && <HeroMatch f={hero} now={now} onSelect={onSelect} />}

      {liveRows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionHead live>Live now</SectionHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liveRows.map(f => <BoardRow key={f.id} f={f} now={now} onSelect={onSelect} />)}
          </div>
        </div>
      )}

      {slateRows.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionHead>{isToday ? 'Up next today' : `Next matchday · ${slateDayLabel}`}</SectionHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {slateRows.map(f => <BoardRow key={f.id} f={f} now={now} onSelect={onSelect} />)}
          </div>
        </div>
      )}

      {finishedToday.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <button
            onClick={() => setShowResults(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '11px 13px', background: 'var(--bg-raised)', border: '1px solid var(--border-default)',
              borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)', ...mono, fontSize: 11, letterSpacing: '0.06em',
            }}
          >
            {showResults ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            TODAY'S RESULTS
            <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{finishedToday.length} played</span>
          </button>
          {showResults && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {finishedToday.map(f => <BoardRow key={f.id} f={f} now={now} onSelect={onSelect} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SectionHead({ children, live }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {live && <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />}
      <span style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: live ? 'var(--success)' : 'var(--text-tertiary)' }}>
        {children}
      </span>
    </div>
  );
}

export default MatchdayBoard;
