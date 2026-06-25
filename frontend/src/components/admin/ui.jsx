// ─── ADMIN UI KIT ───────────────────────────────────────────────────
// Shared primitives + demo-aware data hook for every CEO dashboard page.

import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/adminClient.js';

// ─── palette (matches the app's design tokens) ──────────────────────
export const C = {
  surface: 'var(--bg-surface)', raised: 'var(--bg-raised)', base: 'var(--bg-base)',
  border: 'var(--border-subtle)', borderD: 'var(--border-default)',
  text: 'var(--text-primary)', t2: 'var(--text-secondary)', t3: 'var(--text-tertiary)',
  accent: 'var(--accent)', accentMuted: 'var(--accent-muted)', mono: 'var(--font-mono)',
  ok: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)', cyan: 'var(--calibration-cyan)',
};

// ─── demo-mode context + demo-aware fetcher ─────────────────────────
export const AdminCtx = createContext({ demo: false, setDemo: () => {} });
export const useAdminCtx = () => useContext(AdminCtx);

// React Query hook that appends ?demo=1 when demo mode is on, and keys on it.
export function useAdmin(path, ms = 30000) {
  const { demo } = useAdminCtx();
  const sep = path.includes('?') ? '&' : '?';
  const url = demo ? `${path}${sep}demo=1` : path;
  return useQuery({
    queryKey: ['adm', path, demo],
    queryFn: () => adminApi.get(url).then(r => r.data?.data),
    refetchInterval: ms, staleTime: 0, retry: 0,
  });
}

// ─── helpers ────────────────────────────────────────────────────────
export const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`, gap: 12 });
export const fmtUsd = (n) => `$${Number(n || 0).toFixed(2)}`;

export const timeAgo = (ts) => {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 0) return 'now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const uptime = (s) => {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
export const flag = (cc) => {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
};

// ─── primitives ─────────────────────────────────────────────────────
export function Card({ children, style, onClick }) {
  const clickable = !!onClick;
  return (
    <div onClick={onClick} style={{
      background: `linear-gradient(155deg, ${C.raised} 0%, ${C.surface} 70%)`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: 18,
      cursor: clickable ? 'pointer' : 'default', transition: 'border-color 160ms ease, transform 160ms ease',
      ...style,
    }}
    onMouseEnter={clickable ? (e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.transform = 'translateY(-1px)'; } : undefined}
    onMouseLeave={clickable ? (e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none'; } : undefined}
    >{children}</div>
  );
}

// Trend chip — direction + % change vs a prior period, coloured by whether the
// move is GOOD. goodDirection='down' (e.g. Brier) makes a fall read green; the
// default 'up' makes a fall read red (visitors, subscribers). This is what stops
// a number from looking scary without context.
export function Trend({ curr, prev, goodDirection = 'up', label }) {
  const c = Number(curr) || 0, p = Number(prev) || 0;
  const diff = c - p;
  const pct = p === 0 ? null : (diff / p) * 100;
  const noBase = p === 0;
  const flat = !noBase && Math.abs(pct) < 1;
  const up = diff > 0;
  const neutral = flat || (noBase && c === 0);
  const good = up === (goodDirection === 'up');
  const color = neutral ? C.t3 : good ? C.ok : C.bad;
  const arrow = neutral ? '→' : up ? '▲' : '▼';
  const txt = noBase ? (c > 0 ? 'new' : '—') : `${Math.abs(pct).toFixed(0)}%`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color }}>
      <span style={{ fontSize: 8 }}>{arrow}</span>{txt}
      {label && <span style={{ color: C.t3, fontWeight: 400, marginLeft: 1 }}>{label}</span>}
    </span>
  );
}

// Clickable KPI tile — shows a "details ›" affordance when it links somewhere.
// Pass `trend={{ curr, prev, goodDirection, label }}` to surface a vs-prior chip.
export function Metric({ label, value, sub, color, live, to, trend }) {
  const navigate = useNavigate();
  return (
    <Card onClick={to ? () => navigate(to) : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {live && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.ok, boxShadow: `0 0 6px ${C.ok}` }} className="animate-pulse" />}
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.t3 }}>{label}</span>
        {to && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.accent }}>details ›</span>}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 30, fontWeight: 700, color: color || C.text, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{value}</div>
      {(trend || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {trend && <Trend {...trend} />}
          {sub && <span style={{ fontSize: 11, color: C.t3 }}>{sub}</span>}
        </div>
      )}
    </Card>
  );
}

export function Bar({ used, limit, label, danger = 0.9, warn = 0.7 }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const ratio = limit ? used / limit : 0;
  const color = ratio >= danger ? C.bad : ratio >= warn ? C.warn : C.ok;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.t2 }}>{label}</span>
        <span style={{ fontFamily: C.mono, color }}>{used}{limit ? ` / ${limit}` : ''}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 600ms ease' }} />
      </div>
    </div>
  );
}

export function Section({ title, children, right }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.t3 }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Row({ left, right, max, val }) {
  const pct = max && val != null ? Math.min(100, (val / max) * 100) : null;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t2, textTransform: 'capitalize' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{left}</span>
        <span style={{ fontFamily: C.mono, color: C.text, flexShrink: 0 }}>{right}</span>
      </div>
      {pct != null && (
        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginTop: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.accent, opacity: 0.5 }} />
        </div>
      )}
    </div>
  );
}

export function MiniStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: color || C.text }}>{value}</div>
    </div>
  );
}

// Simple SVG sparkline/bar chart for timeseries.
export function MiniChart({ data, xKey, yKey, height = 90, color = C.accent }) {
  const vals = (data || []).map(d => Number(d[yKey]) || 0);
  const max = Math.max(1, ...vals);
  if (!vals.length) return <Empty />;
  const w = 100 / vals.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height }}>
      {vals.map((v, i) => {
        const h = (v / max) * 38;
        return <rect key={i} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx={0.6} fill={color} opacity={0.85} />;
      })}
    </svg>
  );
}

export const Empty = ({ label = 'No data yet' }) => <div style={{ fontSize: 12, color: C.t3 }}>{label}</div>;

export function PanelTitle({ children }) {
  return <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{children}</div>;
}
