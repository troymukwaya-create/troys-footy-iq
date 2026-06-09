// ─── TRAFFIC DETAIL — richer analytics ──────────────────────────────
import React from 'react';
import { useAdmin, Card, Section, Metric, Row, PanelTitle, Empty, grid, flag, timeAgo, C } from '../../components/admin/ui.jsx';

// Dual-series trend chart: views (area) + unique visitors (line), with grid + axis.
function TrendChart({ data, height = 170 }) {
  const rows = (data || []).filter(Boolean);
  if (rows.length < 2) return <Empty label="Not enough data yet for a trend — it fills in as people visit." />;
  const views = rows.map(r => Number(r.views) || 0);
  const visitors = rows.map(r => Number(r.visitors) || 0);
  const maxV = Math.max(1, ...views, ...visitors);
  const W = 620, H = height, pad = 26;
  const x = (i) => pad + (i / (rows.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - (v / maxV) * (H - pad * 2);
  const line = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(views)} L${x(views.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const grids = [0, 0.25, 0.5, 0.75, 1];
  const fmtDay = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        {grids.map((g, i) => (
          <line key={i} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <text x={pad} y={pad - 8} fill="var(--text-tertiary)" fontSize="10" fontFamily="var(--font-mono)">{maxV}</text>
        <path d={area} fill="var(--accent)" opacity="0.12" />
        <path d={line(views)} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path d={line(visitors)} fill="none" stroke="var(--calibration-cyan)" strokeWidth="2" strokeDasharray="3 3" />
        {views.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.2" fill="var(--accent)" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.t3, marginTop: 2 }}>
        <span>{fmtDay(rows[0]?.day)}</span>
        <span>{fmtDay(rows[Math.floor(rows.length / 2)]?.day)}</span>
        <span>today</span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
        <span style={{ color: C.accent }}>● Pageviews</span>
        <span style={{ color: C.cyan }}>┄ Unique visitors</span>
      </div>
    </div>
  );
}

// Horizontal labelled bar with flag/value (reused for breakdowns).
function Bars({ items, label, value, withFlag }) {
  const rows = items || [];
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map(r => Number(value(r)) || 0), 1);
  return rows.map((r, i) => (
    <div key={i} style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t2, marginBottom: 3, textTransform: 'capitalize' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{withFlag ? `${flag(label(r))} ` : ''}{label(r)}</span>
        <span style={{ fontFamily: C.mono, color: C.text }}>{value(r)}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{ width: `${(value(r) / max) * 100}%`, height: '100%', background: C.accent, opacity: 0.55, borderRadius: 3 }} />
      </div>
    </div>
  ));
}

// Conversion funnel: pageview → prediction view → AI analysis → share.
function Funnel({ engagement, views }) {
  const get = (name) => (engagement || []).find(e => e.event_name === name)?.n || 0;
  const steps = [
    { label: 'Pageviews (today)', n: views || 0, color: C.cyan },
    { label: 'Prediction viewed', n: get('prediction_viewed'), color: C.accent },
    { label: 'AI analysis opened', n: get('ai_analysis_opened'), color: C.accent },
    { label: 'Shared', n: get('share_clicked'), color: C.ok },
  ];
  const top = Math.max(steps[0].n, 1);
  return steps.map((s, i) => {
    const pct = Math.round((s.n / top) * 100);
    const conv = i > 0 && steps[i - 1].n > 0 ? Math.round((s.n / steps[i - 1].n) * 100) : null;
    return (
      <div key={i} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t2, marginBottom: 3 }}>
          <span>{s.label}</span>
          <span style={{ fontFamily: C.mono, color: C.text }}>{s.n}{conv != null ? <span style={{ color: C.t3 }}> · {conv}%</span> : ''}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: s.color, borderRadius: 4 }} />
        </div>
      </div>
    );
  });
}

export default function TrafficDetail() {
  const detail = useAdmin('/traffic/detail', 60000).data || {};
  const traffic = useAdmin('/traffic', 60000).data || {};
  const visitors = useAdmin('/visitors', 60000).data || {};
  const o = useAdmin('/overview', 30000).data || {};

  const daily = detail.daily || [];
  const totalViews = daily.reduce((s, d) => s + (Number(d.views) || 0), 0);
  const peak = daily.reduce((m, d) => Math.max(m, Number(d.views) || 0), 0);
  const avg = daily.length ? Math.round(totalViews / daily.length) : 0;
  const sum = visitors.summary || {};

  return (
    <>
      <Section title="Audience — last 14 days">
        <div style={grid('150px')}>
          <Metric live label="Live now" value={sum.live ?? o.traffic?.liveVisitors ?? 0} color={C.cyan} sub="active in 5 min" />
          <Metric label="Pageviews (14d)" value={totalViews} sub={`${avg}/day avg`} />
          <Metric label="Unique visitors" value={sum.total ?? o.traffic?.visitorsWeek ?? 0} />
          <Metric label="New vs returning" value={`${sum.newVisitors ?? 0}/${sum.returning ?? 0}`} sub="new / returning" />
          <Metric label="Peak day" value={peak} sub="busiest day's views" color={C.accent} />
        </div>
      </Section>

      <Section title="Traffic trend">
        <Card>
          <PanelTitle>Pageviews & unique visitors — 14 days</PanelTitle>
          <TrendChart data={daily} />
        </Card>
      </Section>

      <Section title="Engagement funnel (today) — are visitors converting to predictions?">
        <Card>
          <Funnel engagement={traffic.engagement} views={o.traffic?.viewsToday} />
        </Card>
      </Section>

      <Section title="Where your audience comes from">
        <div style={grid('230px')}>
          <Card><PanelTitle>Top countries</PanelTitle><Bars items={traffic.countries} label={(r) => r.country} value={(r) => r.visitors} withFlag /></Card>
          <Card><PanelTitle>Traffic sources</PanelTitle><Bars items={traffic.referrers} label={(r) => r.source} value={(r) => r.hits} /></Card>
          <Card><PanelTitle>Devices</PanelTitle><Bars items={traffic.devices} label={(r) => r.device} value={(r) => r.visitors} /></Card>
          <Card><PanelTitle>Browsers</PanelTitle><Bars items={detail.browsers} label={(r) => r.browser} value={(r) => r.visitors} /></Card>
          <Card><PanelTitle>Operating system</PanelTitle><Bars items={detail.os} label={(r) => r.os} value={(r) => r.visitors} /></Card>
          <Card><PanelTitle>Most viewed matches</PanelTitle><Bars items={traffic.topMatches} label={(r) => `${r.home} v ${r.away}`} value={(r) => r.views} /></Card>
        </div>
      </Section>
    </>
  );
}
