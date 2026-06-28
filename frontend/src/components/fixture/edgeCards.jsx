// ─── EDGE RAIL CARDS ────────────────────────────────────────────────
// The "Edge" rail from the Claude Design "Home" exploration (home-cards.jsx):
// the model-vs-market EdgeBar, the ranked "Today's Edge" calls (FeaturedCall +
// EdgeRow), and the Suggested-Slip card. Ported to the app's real utilities
// (flagUrl / getMatchColor / teamCode) + the shared fixture-card tokens (T).
// One oxblood language with the seam cards: the oxblood IS the edge.

import React from 'react';
import { T, num, label, disp } from './primitives.jsx';
import { flagUrl } from '../../constants/nationFlags.js';
import { getMatchColor } from '../../constants/nationColors.js';
import { teamCode, isLight } from './oddData.js';

// ── circular crisp flag (sporty roundel), club-code fallback ────────────────
export function FlagRound({ name, size, ringColor }) {
  const url = flagUrl(name, size >= 80 ? 320 : 160);
  const base = {
    width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    outline: '2px solid ' + (ringColor || 'rgba(255,255,255,0.18)'), outlineOffset: -1,
  };
  if (!url) {
    const col = getMatchColor(name);
    return (
      <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', background: col }}>
        <span style={{ ...num(size * 0.3, 700), color: isLight(col) ? '#111' : '#fff' }}>{teamCode(name)}</span>
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" style={base} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

// ── tiny glyphs ─────────────────────────────────────────────────────────────
const ArrowR = ({ c, s }) => (
  <svg width={s || 14} height={s || 14} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M4 12h15M13 6l6 6-6 6" stroke={c || T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Diamond = ({ c, s }) => (
  <span style={{ display: 'inline-block', width: s || 7, height: s || 7, background: c || T.accent, transform: 'rotate(45deg)', flexShrink: 0 }} />
);

// ── the gap between market price and our model price — the oxblood IS the edge ─
export function EdgeBar({ model, market, h, teamColor }) {
  const base = teamColor || '#39434F';
  const hh = h || 6;
  const edge = Math.max(0, model - market);
  return (
    <div style={{ position: 'relative', height: hh, borderRadius: 99, background: T.b1, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(market, 100) + '%', background: base }} />
      <div style={{ position: 'absolute', left: market + '%', top: 0, bottom: 0, width: edge + '%', background: 'linear-gradient(90deg,' + T.accent + ',' + T.accentDeep + ')', boxShadow: edge > 0 ? 'inset 1.5px 0 0 rgba(0,0,0,0.5)' : 'none' }} />
    </div>
  );
}

export function EdgeChip({ edge, big }) {
  if (!edge || edge <= 0) return <span style={{ ...label(big ? 9 : 8), color: T.t4, whiteSpace: 'nowrap' }}>fair price</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, padding: big ? '4px 9px' : '2px 7px', borderRadius: 7, background: T.accentSoft, border: '1px solid ' + T.accentLine, color: '#E6A99A', whiteSpace: 'nowrap' }}>
      <span style={{ ...num(big ? 14 : 11, 700) }}>+{edge}</span>
      <span style={{ ...label(big ? 8 : 7) }}>pts</span>
    </span>
  );
}

export function RailHead({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
      {icon && <span style={{ color: T.accent, display: 'inline-flex' }}>{icon}</span>}
      <h3 style={{ ...disp(16, 800), color: T.t1 }}>{children}</h3>
    </div>
  );
}

// ── EdgePanel — the "what is the edge" explainer + a live demo bar ───────────
export function EdgePanel() {
  return (
    <section>
      <RailHead icon={<Diamond s={9} c={T.accent} />}>What's the edge?</RailHead>
      <p style={{ margin: '0 0 14px', ...num(12.5, 400), lineHeight: 1.6, color: T.t2 }}>
        The gap between our model's price and the bookmakers'. When we make a result <b style={{ color: T.t1, fontWeight: 600 }}>likelier than the odds imply</b>, that gap — the oxblood below — is the value leaning your way.
      </p>
      <div style={{ padding: '13px 15px', borderRadius: 12, background: T.surface, border: '1px solid ' + T.b1 }}>
        <EdgeBar model={80} market={62} h={9} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: '#39434F' }} />
            <span style={{ ...label(8), color: T.t3, whiteSpace: 'nowrap' }}>Market price</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: T.accent }} />
            <span style={{ ...label(8), color: '#E6A99A', whiteSpace: 'nowrap' }}>Your edge</span>
          </span>
        </div>
      </div>
    </section>
  );
}

// ── FeaturedCall — the single biggest edge today ────────────────────────────
export function FeaturedCall({ c, onClick }) {
  const out = (c.pick || '').split(' ').pop() || 'win';
  const edge = Math.max(0, c.pct - c.mkt);
  return (
    <button type="button" className="rail-call" onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '15px 16px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(192,57,43,0.12), ' + T.surface + ' 64%)', border: '1px solid ' + T.accentLine }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Diamond s={6} c={T.accent} />
          <span style={{ ...label(8.5), color: '#E6A99A' }}>Top edge today</span>
        </span>
        <EdgeChip edge={edge} big />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', flexShrink: 0 }}><FlagRound name={c.team} size={40} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...disp(19, 800), color: T.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.team}</div>
          <div style={{ ...num(10.5, 400), color: T.t3, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>to {out} · v {c.opp}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...num(30, 600), color: T.accent, lineHeight: 1 }}>{c.pct}<span style={{ fontSize: 15, color: '#E6A99A' }}>%</span></div>
          <div style={{ ...label(7.5), color: T.t4, marginTop: 4 }}>model</div>
        </div>
      </div>
      <EdgeBar model={c.pct} market={c.mkt} h={9} teamColor={getMatchColor(c.team)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
        <span style={{ ...num(10, 500), color: T.t3 }}>Market <b style={{ color: T.t2, fontWeight: 600 }}>{c.mkt}%</b></span>
        <span style={{ ...num(10, 500), color: '#E6A99A' }}>Model <b style={{ fontWeight: 600 }}>{c.pct}%</b></span>
      </div>
    </button>
  );
}

// ── EdgeRow — a ranked edge below the featured call ─────────────────────────
export function EdgeRow({ n, c, onClick }) {
  const out = (c.pick || '').split(' ').pop() || 'win';
  const edge = Math.max(0, c.pct - c.mkt);
  return (
    <button type="button" className="rail-call" onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: 12, background: T.surface, border: '1px solid ' + T.b1 }}>
      <span style={{ ...num(11, 600), color: T.t4, width: 10, flexShrink: 0, textAlign: 'center' }}>{n}</span>
      <span style={{ flexShrink: 0, display: 'inline-flex' }}><FlagRound name={c.team} size={26} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ ...disp(13.5, 700), color: T.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.team}</span>
          <EdgeChip edge={edge} />
        </div>
        <div style={{ ...num(10, 400), color: T.t3, margin: '3px 0 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{out} · v {c.opp} · {c.pct}%</div>
        <EdgeBar model={c.pct} market={c.mkt} h={5} teamColor={getMatchColor(c.team)} />
      </div>
    </button>
  );
}

// ── SlipCard — a ready-made acca, the design's rail styling ──────────────────
export function SlipCard({ s, onClick }) {
  const legs = s.legNations || [];
  return (
    <button type="button" className="rail-call" onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 15px', borderRadius: 13, background: s.highlight ? 'linear-gradient(180deg, rgba(192,57,43,0.12), ' + T.surface + ' 70%)' : T.surface, border: '1px solid ' + (s.highlight ? T.accentLine : T.b1) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...disp(15, 800), color: T.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
          <div style={{ ...num(11, 400), color: T.t3, lineHeight: 1.4, marginTop: 4 }}>{s.desc}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...num(22, 600), color: T.accent, lineHeight: 1 }}>{s.mult}</div>
          <div style={{ ...label(7.5), color: T.t4, marginTop: 4 }}>{s.legs} legs</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 11, borderTop: '1px solid ' + T.b1 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {legs.slice(0, 5).map((nm, i) => (
            <span key={i} style={{ marginLeft: i ? -7 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px ' + T.surface, display: 'inline-flex' }}><FlagRound name={nm} size={20} ringColor="rgba(255,255,255,0.22)" /></span>
          ))}
          {s.model && <span style={{ ...num(10, 400), color: T.t4, marginLeft: 9 }}>{s.model}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...label(8.5), color: s.good ? '#E6A99A' : T.t3 }}>
          {s.tag}{s.good && <ArrowR s={12} c={T.accent} />}
        </span>
      </div>
    </button>
  );
}

export default { FlagRound, EdgeBar, EdgeChip, EdgePanel, FeaturedCall, EdgeRow, SlipCard, RailHead };
