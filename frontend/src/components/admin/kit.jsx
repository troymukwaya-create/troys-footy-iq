// ─── ELEVATED ADMIN KIT ─────────────────────────────────────────────
// Richer primitives layered on the existing tokens (C) + icon set. Used by the
// new Mission Control + Engine pages. Everything here is presentational + pure.

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, Card } from './ui.jsx';
import { Icon } from './icons.jsx';

const TONE = {
  accent: C.accent, ok: C.ok, warn: C.warn, bad: C.bad, neutral: C.t3, cyan: C.cyan,
};

// Small status pill. tone ∈ accent|ok|warn|bad|neutral|cyan
export function Badge({ children, tone = 'neutral', solid = false, style }) {
  const color = TONE[tone] || C.t3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
      padding: '4px 8px', borderRadius: 999,
      color: solid ? '#fff' : color,
      background: solid ? color : `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      ...style,
    }}>{children}</span>
  );
}

// Pulsing live dot.
export function LiveDot({ color = C.ok, size = 7 }) {
  return <span className="animate-pulse" style={{ width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />;
}

// Absolute delta vs a prior value, coloured by whether the move is good.
export function Delta({ value, goodDirection = 'up', suffix = '', digits = 0 }) {
  const v = Number(value) || 0;
  const flat = Math.abs(v) < (digits ? 10 ** -digits : 0.0005);
  const up = v > 0;
  const good = up === (goodDirection === 'up');
  const color = flat ? C.t3 : good ? C.ok : C.bad;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: C.mono, fontSize: 11, fontWeight: 700, color }}>
      <Icon name={flat ? 'arrow' : up ? 'trendUp' : 'trendDown'} size={11} />
      {v > 0 ? '+' : ''}{v.toFixed(digits)}{suffix}
    </span>
  );
}

// Segmented control / tabs.
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 9 }}>
      {tabs.map(t => {
        const on = (t.key ?? t) === active;
        return (
          <button key={t.key ?? t} onClick={() => onChange(t.key ?? t)} style={{
            fontSize: 12, fontWeight: on ? 700 : 500, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
            border: 'none', color: on ? '#fff' : C.t2, background: on ? C.accent : 'transparent',
            transition: 'background 160ms ease, color 160ms ease',
          }}>{t.label ?? t}</button>
        );
      })}
    </div>
  );
}

// Icon KPI tile — richer than Metric: a tinted icon chip, big mono value, trend.
export function StatCard({ icon, label, value, sub, color, tone = 'accent', to, trend, live }) {
  const navigate = useNavigate();
  const accent = TONE[tone] || C.accent;
  return (
    <Card onClick={to ? () => navigate(to) : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 116 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)` }}>
          <Icon name={icon} size={16} />
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.t3 }}>{label}</span>
        {live && <LiveDot />}
        {to && <Icon name="chevron" size={14} color={C.t3} style={{ marginLeft: 'auto' }} />}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700, color: color || C.text, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{value}</div>
        {(trend || sub) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            {trend}
            {sub && <span style={{ fontSize: 11, color: C.t3 }}>{sub}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}

// SVG line chart (area + line) for a timeseries. goodDirection tints the fill.
export function LineChart({ data, yKey, height = 64, color = C.accent, baseline }) {
  const vals = (data || []).map(d => (typeof d === 'number' ? d : Number(d[yKey]) || 0));
  if (vals.length < 2) return <div style={{ height, display: 'grid', placeItems: 'center', fontSize: 11, color: C.t3 }}>Not enough data yet</div>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const n = vals.length;
  const x = (i) => (i / (n - 1)) * 100;
  const y = (v) => 38 - ((v - min) / range) * 34 - 2;
  const line = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `0,40 ${line} 100,40`;
  const gid = `g${yKey || 'v'}${Math.round(min * 1000)}`;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.30" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {baseline != null && Number.isFinite(y(baseline)) && (
        <line x1="0" x2="100" y1={y(baseline)} y2={y(baseline)} stroke={C.t3} strokeWidth="0.4" strokeDasharray="2 2" opacity="0.5" />
      )}
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// Donut ring showing a 0..1 ratio (win rate, calibration, etc.).
export function Donut({ value, size = 76, stroke = 8, color = C.accent, label, center }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 700ms ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: C.mono, fontSize: size > 64 ? 16 : 13, fontWeight: 700, color: C.text }}>
          {center}
        </div>
      </div>
      {label && <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
    </div>
  );
}

// Clean data table with hover rows + optional row click + optional sort.
export function DataTable({ columns, rows, onRowClick, empty = 'No data yet', maxRows }) {
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows || [];
    const col = columns.find(c => c.key === sort.key);
    const get = col?.sortVal || ((r) => r[sort.key]);
    return [...(rows || [])].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null) return 1; if (bv == null) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
  }, [rows, sort, columns]);
  const shown = maxRows ? sorted.slice(0, maxRows) : sorted;
  if (!rows?.length) return <div style={{ fontSize: 12, color: C.t3, padding: '14px 2px' }}>{empty}</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{columns.map(c => (
            <th key={c.key} onClick={c.sortable ? () => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 })) : undefined}
              style={{ textAlign: c.align || 'left', padding: '7px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.t3, borderBottom: `1px solid ${C.border}`, cursor: c.sortable ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
              {c.label}{c.sortable && sort.key === c.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.id ?? r.key ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background 120ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {columns.map(c => (
                <td key={c.key} style={{ textAlign: c.align || 'left', padding: '8px 10px', color: c.mono ? C.text : C.t2, fontFamily: c.mono ? C.mono : 'inherit', borderBottom: `1px solid ${C.border}`, whiteSpace: c.wrap ? 'normal' : 'nowrap', maxWidth: c.maxWidth }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A titled panel (heavier than Section) for grouping dense content.
export function Panel({ title, icon, right, children, style }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: `1px solid ${C.border}` }}>
        {icon && <Icon name={icon} size={15} color={C.accent} />}
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', color: C.text }}>{title}</span>
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </Card>
  );
}

export default { Badge, LiveDot, Delta, Tabs, StatCard, LineChart, Donut, DataTable, Panel };
