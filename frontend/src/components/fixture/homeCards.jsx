// ─── HOME BROADCAST CARDS ───────────────────────────────────────────
// The re-imagined home, built on the VersusHero "broadcast" motif and ported
// from the Claude Design "Home" exploration (home-cards.jsx). Two surfaces:
//   • MatchOfDay  — the featured broadcast hero (one game to look at)
//   • MatchBand   — the live / up-next lower-third band (replaces the old
//                   flag-bleed board row with the seam motif — the "match the
//                   rest of the brand identity" pass).
// Both consume the same `v` state-view (fixtureView + a few board-computed
// extras) and reuse the already-ported primitives, so a card never disagrees
// with the fixture cards in the sidebar.

import React from 'react';
import { VersusHero, ProbViz, RiskPill, FlagBleedBg, T, disp, num, label } from './primitives.jsx';
import { getMatchColor } from '../../constants/nationColors.js';

// seam tilt → the two x-crossing points of the diagonal fold
function seamOf(t) { const k = t.seamTilt == null ? 8 : t.seamTilt; return [50 + k, 50 - k]; }

// the shared probability viz, fed the real nation colours
function Viz({ v, t }) {
  return (
    <ProbViz
      prob={v.prob} mode={t.probViz} colorMode={t.colorMode}
      homeColor={getMatchColor(v.home)} awayColor={getMatchColor(v.away)}
      density={t.density} score={v.score} state={v.state} accent={t.accent}
    />
  );
}

// ── tiny glyphs ───────────────────────────────────────────────────────────
const ArrowR = ({ c, s }) => (
  <svg width={s || 14} height={s || 14} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M4 12h15M13 6l6 6-6 6" stroke={c || T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevDown = ({ c, s }) => (
  <svg width={s || 12} height={s || 12} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M5 9l7 7 7-7" stroke={c || T.t3} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Diamond = ({ c, s }) => (
  <span style={{ display: 'inline-block', width: s || 7, height: s || 7, background: c || T.accent, transform: 'rotate(45deg)', flexShrink: 0 }} />
);

// ── small chips ───────────────────────────────────────────────────────────
function Chip({ children, tone }) {
  const map = {
    edge: { bg: T.accentSoft, bd: T.accentLine, fg: '#E0A28F' },
    plain: { bg: 'rgba(255,255,255,0.04)', bd: T.b2, fg: T.t3 },
  };
  const s = map[tone] || map.plain;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: s.bg, border: '1px solid ' + s.bd, ...label(8.5), color: s.fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
function LockChip({ label: txt }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid ' + T.b2 }}>
      <span style={{ ...label(8.5), color: T.t3 }}>{txt}</span><ChevDown s={11} />
    </span>
  );
}
function Insight({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      <span style={{ color: T.accent, ...num(12, 600), flexShrink: 0 }}>›</span>
      <span style={{ ...num(12.5, 400), color: T.t2, lineHeight: 1.45 }}>{children}</span>
    </div>
  );
}

// one-word descriptor for the hero, from the model's own shape
function descriptorOf(prob) {
  if (!prob) return 'LIVE EDGE';
  if (prob.draw >= 35) return 'OPEN GAME';
  if (Math.max(prob.home, prob.away) >= 70) return 'STRONG CALL';
  return 'LIVE EDGE';
}

// ── MATCH OF THE DAY — the featured broadcast hero ────────────────────────────
// The whole card is the click target (→ full analysis). Bigger seam, the
// "Match of the Day" plate + kickoff/countdown over the fold.
export function MatchOfDay({ v, t = {}, onSelect, onMouseEnter }) {
  if (!v?.prob) return null;
  const descriptor = descriptorOf(v.prob);
  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect} onMouseEnter={onMouseEnter}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); } }}
      className="home-card"
      style={{ position: 'relative', cursor: 'pointer', background: T.raised, border: '1px solid ' + T.b2, borderRadius: 18, overflow: 'hidden', isolation: 'isolate', marginBottom: 22 }}
    >
      {t.flagBg && <FlagBleedBg home={v.home} away={v.away} on opacity={0.08} />}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg,' + (t.accent || T.accent) + ',' + T.accentDeep + ')', zIndex: 8 }} />
      <div style={{ position: 'relative' }}>
        <VersusHero v={v} t={t} h={176} seam={seamOf(t)} disc={32} codes codeSize={30} discTop={45} />
        <div style={{ position: 'absolute', top: 13, left: 22, right: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <Diamond s={7} c={t.accent || T.accent} />
            <span style={{ ...label(10), color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Match of the Day</span>
          </span>
          <span style={{ ...num(11, 500), color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 6px rgba(0,0,0,0.7)', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {v.state === 'live' ? `LIVE ${v.minute ? v.minute + "'" : ''}` : `KICKOFF ${v.kickoff}${v.countdown ? ' · ' + v.countdown : ''}`}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', padding: '16px clamp(16px,4vw,24px) 20px clamp(20px,4.5vw,28px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9, ...disp('clamp(16px,4.4vw,21px)', 800), color: T.t1 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.home}</span>
          <span style={{ color: T.t3, fontWeight: 500, fontSize: '0.72em', flexShrink: 0 }}>v</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.away}</span>
        </div>
        <div style={{ ...label(9), color: T.t3, marginBottom: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[v.league, v.stage, v.venue].filter(Boolean).join(' · ')}
        </div>
        <div style={{ marginBottom: 18 }}><Viz v={v} t={t} /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {v.edge && <Chip tone="edge"><Diamond s={5} c="#E0A28F" />{v.edge}</Chip>}
          {v.scoreCall ? <Chip tone="plain">{v.scoreCall}</Chip> : <Chip tone="plain">{descriptor}</Chip>}
          {v.lock && <Chip tone="plain">{v.lock}</Chip>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {v.insight ? <Insight>{v.insight}</Insight> : <span />}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...label(9.5), color: t.accent || T.accent }}>
            Full analysis <ArrowR s={14} c={t.accent || T.accent} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── MATCH BAND — the live / up-next lower-third ───────────────────────────────
// Inner content only — the surrounding card chrome + expand panel live in the
// board row so the band stays expand-in-place. `live` gets the oxblood spine.
export function MatchBand({ v, t = {} }) {
  if (!v?.prob) return null;
  const live = v.state === 'live';
  const sub = live ? v.venue : [v.venue, v.countdown].filter(Boolean).join('  ·  ');
  return (
    <div style={{ position: 'relative', isolation: 'isolate' }}>
      {t.flagBg && <FlagBleedBg home={v.home} away={v.away} on opacity={0.08} />}
      {live && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: t.accent || T.accent, zIndex: 8 }} />}
      <VersusHero v={v} t={t} h={120} seam={seamOf(t)} disc={23} meta icon={v.state === 'upcoming' ? 'KickoffIcon' : null} codes codeSize={27} discTop={50} />
      <div style={{ position: 'relative', padding: '13px 18px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span style={{ ...num(10.5, 400), color: T.t3, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
          {v.lock && <LockChip label={v.lock} />}
        </div>
        <div style={{ marginBottom: 13 }}><Viz v={v} t={t} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {v.insight ? <Insight>{v.insight}</Insight> : <span />}
          {v.state === 'upcoming' && v.risk ? <RiskPill level={v.risk} small /> : null}
        </div>
      </div>
    </div>
  );
}

export default { MatchOfDay, MatchBand };
