// ─── FIXTURE-CARD PRIMITIVES ────────────────────────────────────────
// Shared building blocks for the re-imagined fixture cards, ported from the
// Claude Design "Fixture Cards" exploration (primitives.jsx). The motif:
// two crisp flags lean toward each other and meet on a diagonal seam; a
// skewed scoreboard plate rides the fold — score when known, VS otherwise.
// One motif, reused at every size.
//
// Wired to the app's real utilities (flagUrl / getMatchColor / OrbitMark /
// FlagBleed) instead of the design harness's window globals.

import React from 'react';
import { flagUrl } from '../../constants/nationFlags.js';
import { getMatchColor } from '../../constants/nationColors.js';
import OrbitMark from '../OrbitMark.jsx';
import { KickoffIcon, PitchIcon, EdgeIcon } from '../BrandIcons.jsx';
import FlagBleed from '../FlagBleed.jsx';
import { teamCode, isLight, pickOutcome, resultOutcome, verdict } from './oddData.js';

// Brand mark registry (replaces window.Oddyessa.* lookups).
const MARKS = { OrbitMark, KickoffIcon, PitchIcon, EdgeIcon };

// Palette + type idioms (verbatim from the design — self-contained so the card
// renders identically to the approved exploration).
export const T = {
  bg: '#1B1E25', surface: '#0B0B0D', raised: '#14161B', raised2: '#181B22', hover: '#1E2128',
  accent: '#C0392B', accentDeep: '#8C2820', accentSoft: 'rgba(192,57,43,0.16)', accentLine: 'rgba(192,57,43,0.34)',
  t1: 'rgba(255,255,255,0.92)', t2: 'rgba(255,255,255,0.60)', t3: 'rgba(255,255,255,0.38)', t4: 'rgba(255,255,255,0.20)',
  b1: 'rgba(255,255,255,0.06)', b2: 'rgba(255,255,255,0.10)', b3: 'rgba(255,255,255,0.16)',
  success: '#22C55E', warning: '#EAB308', danger: '#EF4444',
  mono: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
  sans: "'Archivo','Archivo Expanded',system-ui,sans-serif",
};

// expanded/heavy display type — the Oddyessa headline idiom
export function disp(size, weight) {
  return { fontFamily: T.sans, fontWeight: weight || 800, fontStretch: '125%', letterSpacing: '-0.02em', fontSize: size, lineHeight: 1, margin: 0 };
}
export function num(size, weight) {
  return { fontFamily: T.mono, fontWeight: weight || 500, fontVariantNumeric: 'tabular-nums', fontSize: size, lineHeight: 1 };
}
export function label(size) {
  return { fontFamily: T.sans, fontWeight: 600, fontSize: size || 9.5, letterSpacing: '0.14em', textTransform: 'uppercase' };
}

// ── Crisp flag (rectangular), with a coloured-code fallback for clubs ──────
export function Flag({ name, w, h, radius, ring, style }) {
  const url = flagUrl(name, w >= 120 ? 640 : 320);
  const r = radius == null ? 3 : radius;
  const base = {
    width: w, height: h, borderRadius: r, objectFit: 'cover', display: 'block', flexShrink: 0,
    boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
    outline: ring === false ? 'none' : '1px solid rgba(255,255,255,0.16)', outlineOffset: -1,
    background: '#222',
  };
  if (!url) {
    return React.createElement('div', { style: { ...base, ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: getMatchColor(name) } },
      React.createElement('span', { style: { ...num(Math.max(9, (h || 24) * 0.32), 700), color: isLight(getMatchColor(name)) ? '#111' : '#fff' } }, teamCode(name)));
  }
  return React.createElement('img', { src: url, alt: name + ' flag', loading: 'lazy', style: { ...base, ...style } });
}

// optional blurred two-nation bleed behind a card (reuses the app's FlagBleed)
export function FlagBleedBg({ home, away, on, opacity }) {
  if (!on) return null;
  return React.createElement(FlagBleed, { home, away, opacity: opacity == null ? 0.34 : opacity });
}

// ── colour assignment for prob segments ──────────────────────────────────
export function segColors(prob, opt) {
  const cm = opt.colorMode;
  const accent = opt.accent || T.accent;
  if (cm === 'nation') return { home: opt.homeColor, draw: '#3a4049', away: opt.awayColor };
  const ranked = [['home', prob.home], ['draw', prob.draw], ['away', prob.away]].sort((a, b) => b[1] - a[1]);
  const ramp = cm === 'brand' ? [accent, '#4b525d', '#373c45'] : ['#c4cad4', '#737b88', '#444a54'];
  const out = {};
  ranked.forEach((e, i) => { out[e[0]] = ramp[i]; });
  return out;
}

// ── Probability viz (4 swappable modes) ──────────────────────────────────
export function ProbViz({ prob, mode, colorMode, homeColor, awayColor, density, score, state, accent }) {
  const ACC = accent || T.accent;
  const cols = segColors(prob, { colorMode, homeColor, awayColor, accent: ACC });
  const pick = pickOutcome(prob);
  const actual = (state === 'settled' && score) ? resultOutcome(score) : null;
  const sides = [['home', 'H', 'HOME'], ['draw', 'D', 'DRAW'], ['away', 'A', 'AWAY']];
  const full = density >= 3;

  if (mode === 'numbers') {
    return React.createElement('div', { style: { display: 'flex', gap: 4 } },
      sides.map(([k, sh, lg]) => {
        const isPick = k === pick, isAct = k === actual;
        const c = colorMode === 'nation' ? (k === 'draw' ? T.t2 : cols[k]) : (isPick ? (colorMode === 'brand' ? ACC : '#e6e9ee') : T.t3);
        return React.createElement('div', {
          key: k, style: {
            flex: 1, padding: full ? '8px 6px 7px' : '6px 4px', borderRadius: 7, textAlign: 'center',
            background: isAct ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: '1px solid ' + (isPick ? T.b3 : T.b1),
          }
        },
          React.createElement('div', { style: { ...num(full ? 22 : 18, 600), color: c } }, Math.round(prob[k])),
          React.createElement('div', { style: { ...label(8.5), color: T.t3, marginTop: 4 } }, full ? lg : sh));
      }));
  }

  if (mode === 'bars') {
    const max = Math.max(prob.home, prob.draw, prob.away, 1);
    const H = full ? 56 : 42;
    return React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
      sides.map(([k, sh, lg]) => {
        const isPick = k === pick;
        return React.createElement('div', { key: k, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 } },
          React.createElement('div', { style: { ...num(13, 600), color: isPick && colorMode !== 'nation' ? (colorMode === 'brand' ? ACC : '#e6e9ee') : T.t1 } }, Math.round(prob[k])),
          React.createElement('div', { style: { width: '100%', height: H, display: 'flex', alignItems: 'flex-end', background: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden' } },
            React.createElement('div', { style: { width: '100%', height: (prob[k] / max * 100) + '%', background: cols[k], borderRadius: '4px 4px 0 0', boxShadow: k === actual ? 'inset 0 0 0 2px rgba(255,255,255,0.5)' : 'none', transition: 'height .4s cubic-bezier(.3,.7,.4,1)' } })),
          React.createElement('div', { style: { ...label(8.5), color: T.t3 } }, full ? lg : sh));
      }));
  }

  if (mode === 'gauge') {
    const r = full ? 34 : 28, sw = full ? 8 : 7, C = 2 * Math.PI * r;
    const pv = prob[pick];
    const pc = colorMode === 'nation' ? cols[pick] : (colorMode === 'brand' ? ACC : '#d7dbe2');
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
      React.createElement('div', { style: { position: 'relative', width: (r + sw) * 2, height: (r + sw) * 2, flexShrink: 0 } },
        React.createElement('svg', { width: (r + sw) * 2, height: (r + sw) * 2, style: { transform: 'rotate(-90deg)' } },
          React.createElement('circle', { cx: r + sw, cy: r + sw, r, fill: 'none', stroke: 'rgba(255,255,255,0.08)', strokeWidth: sw }),
          React.createElement('circle', { cx: r + sw, cy: r + sw, r, fill: 'none', stroke: pc, strokeWidth: sw, strokeLinecap: 'round', strokeDasharray: C, strokeDashoffset: C * (1 - pv / 100), style: { transition: 'stroke-dashoffset .5s cubic-bezier(.3,.7,.4,1)' } })),
        React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
          React.createElement('div', { style: { ...num(full ? 19 : 16, 600), color: T.t1 } }, Math.round(pv)),
          React.createElement('div', { style: { ...label(7), color: T.t3, marginTop: 2 } }, '%'))),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } },
        sides.map(([k, sh, lg]) => React.createElement('div', { key: k, style: { display: 'flex', alignItems: 'center', gap: 7 } },
          React.createElement('span', { style: { width: 7, height: 7, borderRadius: 2, background: cols[k], flexShrink: 0 } }),
          React.createElement('span', { style: { ...label(8.5), color: T.t3, width: 42, whiteSpace: 'nowrap' } }, lg),
          React.createElement('span', { style: { ...num(12, 600), color: k === pick && colorMode === 'brand' ? ACC : T.t1 } }, Math.round(prob[k]))))));
  }

  // default: split bar
  const gap = 3;
  return React.createElement('div', null,
    React.createElement('div', { style: { display: 'flex', gap, height: full ? 14 : 10, marginBottom: 8 } },
      sides.map(([k]) => {
        const isAct = k === actual;
        return React.createElement('div', {
          key: k, style: {
            flexBasis: prob[k] + '%', flexGrow: prob[k], background: cols[k], borderRadius: 3,
            boxShadow: isAct ? 'inset 0 0 0 2px rgba(255,255,255,0.55)' : 'none',
            position: 'relative', transition: 'flex-basis .4s cubic-bezier(.3,.7,.4,1)',
          }
        });
      })),
    React.createElement('div', { style: { display: 'flex', gap } },
      sides.map(([k, sh, lg]) => {
        const isPick = k === pick;
        const c = colorMode === 'nation' ? (k === 'draw' ? T.t2 : cols[k]) : (isPick ? (colorMode === 'brand' ? ACC : '#e6e9ee') : T.t2);
        return React.createElement('div', { key: k, style: { flexBasis: prob[k] + '%', flexGrow: prob[k], display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 } },
          React.createElement('span', { style: { ...num(full ? 14 : 12, 600), color: c } }, Math.round(prob[k])),
          React.createElement('span', { style: { ...label(8), color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sh));
      })));
}

// ── small chips ──────────────────────────────────────────────────────────
export function RiskPill({ level, small }) {
  const map = { LOW: T.success, MEDIUM: T.warning, HIGH: T.danger };
  const c = map[level] || T.t2;
  return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: small ? '2px 7px' : '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.b2 } },
    React.createElement('span', { style: { width: 5, height: 5, borderRadius: '50%', background: c } }),
    React.createElement('span', { style: { ...label(8), color: T.t2, whiteSpace: 'nowrap' } }, (level || 'UNKNOWN') + ' risk'));
}

export function VerdictPill({ prob, score, small }) {
  const v = verdict(prob, score);
  return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: small ? '2px 8px' : '3px 10px', borderRadius: 999, background: v.bg, color: v.color } },
    React.createElement('span', { style: { ...num(10, 700) } }, v.sym),
    React.createElement('span', { style: { ...label(8.5), whiteSpace: 'nowrap' } }, v.label));
}

// recent form pips (W/D/L = data meaning → green/grey/red)
export function MiniForm({ form, size }) {
  const s = size || 14;
  const map = { W: T.success, D: '#5b626d', L: T.danger };
  return React.createElement('div', { style: { display: 'flex', gap: 3 } },
    String(form || '').split('').slice(0, 5).map((r, i) => React.createElement('span', {
      key: i, style: { width: s, height: s, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r === 'D' ? 'transparent' : (map[r] || T.t4) + '26', border: '1px solid ' + (r === 'D' ? T.b2 : (map[r] || T.t4) + '66'), color: map[r] || T.t3, ...num(s * 0.5, 700) }
    }, r)));
}

// status tag: kickoff time / LIVE minute / FT
export function StatusTag({ v, big }) {
  if (v.state === 'live') {
    return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
      React.createElement('span', { className: 'odd-pulse', style: { width: 7, height: 7, borderRadius: '50%', background: T.accent, boxShadow: '0 0 0 0 ' + T.accent } }),
      React.createElement('span', { style: { ...num(big ? 14 : 11, 600), color: T.accent } }, v.minute + "'"));
  }
  if (v.state === 'settled') {
    return React.createElement('span', { style: { ...label(big ? 10 : 9), color: T.t3 } }, 'Full time');
  }
  return React.createElement('span', { style: { ...num(big ? 14 : 12, 500), color: T.t2 } }, v.kickoff);
}

function dsMark(name, size, color) {
  const C = MARKS[name];
  if (!C) return null;
  return <span style={{ display: 'inline-flex', color: color || T.t3, lineHeight: 0 }}><C size={size || 14} /></span>;
}

// ── The skewed scoreboard plate that rides the seam fold ──────────────────
export function ScorePlate({ v, t, size }) {
  const sz = size || 25;
  const homeC = getMatchColor(v.home), awayC = getMatchColor(v.away);
  const ACC = (t && t.accent) || T.accent;
  const mono = t && t.colorMode === 'mono';
  const sH = mono ? 'rgba(255,255,255,0.45)' : homeC, sA = mono ? 'rgba(255,255,255,0.45)' : awayC;
  const fin = v.state === 'settled';
  const hw = v.score && v.score.home > v.score.away, aw = v.score && v.score.away > v.score.home;
  const rad = Math.max(5, sz * 0.28), bar = Math.max(2, sz * 0.12);
  if (v.score) {
    return (
      <div style={{ position: 'relative', transform: 'skewX(-13deg)', background: 'linear-gradient(180deg, rgba(15,17,21,0.94), rgba(8,9,11,0.94))', border: '1px solid rgba(255,255,255,0.16)', borderRadius: rad, boxShadow: '0 12px 28px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: bar, background: `linear-gradient(90deg, ${sH} 0 50%, ${sA} 50% 100%)` }} />
        <div style={{ transform: 'skewX(13deg)', padding: `${sz * 0.36}px ${sz * 0.6}px ${sz * 0.32}px`, display: 'flex', alignItems: 'center', gap: sz * 0.52 }}>
          <span style={{ ...num(sz, 600), color: fin && !hw ? T.t3 : T.t1 }}>{v.score.home}</span>
          {v.state === 'live'
            ? <span className="odd-pulse" style={{ width: Math.max(5, sz * 0.24), height: Math.max(5, sz * 0.24), borderRadius: '50%', background: ACC, flexShrink: 0 }} />
            : <span style={{ width: sz * 0.52, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />}
          <span style={{ ...num(sz, 600), color: fin && !aw ? T.t3 : T.t1 }}>{v.score.away}</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', transform: 'skewX(-13deg)', background: `linear-gradient(180deg, ${ACC}, ${T.accentDeep})`, borderRadius: rad, boxShadow: '0 12px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.28)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: bar, background: `linear-gradient(90deg, ${sH} 0 50%, ${sA} 50% 100%)`, opacity: 0.9 }} />
      <span style={{ display: 'inline-block', transform: 'skewX(13deg)', padding: `${sz * 0.36}px ${sz * 0.76}px ${sz * 0.32}px`, ...disp(sz * 0.64, 800), color: '#fff', fontStyle: 'italic', letterSpacing: '0.03em' }}>VS</span>
    </div>
  );
}

// ── The shared "matchup" hero: two flags clipped on a diagonal seam ───────
export function VersusHero({ v, t, h, w, radius, disc, seam, meta, icon, codes, codeSize, discTop }) {
  const W = w == null ? '100%' : w, H = h || 158, R = radius || 0;
  const hu = flagUrl(v.home, 640), au = flagUrl(v.away, 640);
  const ACC = (t && t.accent) || T.accent;
  const topX = seam ? seam[0] : 60, botX = seam ? seam[1] : 40;
  const homeClip = `polygon(0 0, ${topX}% 0, ${botX}% 100%, 0 100%)`;
  const awayClip = `polygon(${topX}% 0, 100% 0, 100% 100%, ${botX}% 100%)`;
  const dTop = discTop == null ? 50 : discTop;
  const cs = codeSize || 30;
  const showForm = codes && t && t.density >= 2 && H >= 118 && (v.homeForm || v.awayForm);
  return (
    <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden', borderRadius: R, flexShrink: 0, background: '#1d2028' }}>
      {hu
        ? <img src={hu} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: homeClip }} />
        : <div style={{ position: 'absolute', inset: 0, clipPath: homeClip, background: getMatchColor(v.home) }} />}
      {au
        ? <img src={au} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: awayClip }} />
        : <div style={{ position: 'absolute', inset: 0, clipPath: awayClip, background: getMatchColor(v.away) }} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <line x1={topX} y1={-2} x2={botX} y2={102} stroke="rgba(0,0,0,0.5)" strokeWidth={6} vectorEffect="non-scaling-stroke" />
        <line x1={topX} y1={-2} x2={botX} y2={102} stroke={ACC} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,11,14,0.62) 0%, rgba(10,11,14,0.05) 24%, rgba(12,13,17,0.12) 54%, rgba(20,22,27,0.98) 100%)' }} />
      {meta &&
        <div style={{ position: 'absolute', top: 11, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {icon && dsMark(icon, 14, 'rgba(255,255,255,0.92)')}
            <span style={{ ...label(9.5), color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 4px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.league}{v.stage ? ' · ' + v.stage : ''}</span>
          </span>
          <span style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)', flexShrink: 0 }}><StatusTag v={v} /></span>
        </div>}
      {codes &&
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 16px', zIndex: 3 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ ...disp(cs, 800), color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.78)' }}>{teamCode(v.home)}</span>
            {showForm && <MiniForm form={v.homeForm} size={Math.round(cs * 0.4)} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
            <span style={{ ...disp(cs, 800), color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.78)' }}>{teamCode(v.away)}</span>
            {showForm && <MiniForm form={v.awayForm} size={Math.round(cs * 0.4)} />}
          </div>
        </div>}
      <div style={{ position: 'absolute', left: '50%', top: dTop + '%', transform: 'translate(-50%,-50%)', zIndex: 4 }}><ScorePlate v={v} t={t} size={disc || 25} /></div>
    </div>
  );
}

export default { T, disp, num, label, Flag, FlagBleedBg, segColors, ProbViz, RiskPill, VerdictPill, MiniForm, StatusTag, ScorePlate, VersusHero };
