// ─── OVERVIEW — clickable KPI tiles → drill-down pages ──────────────
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, Metric, Card, Section, Row, PanelTitle, Empty, grid, fmtUsd, flag, uptime, timeAgo, C } from '../../components/admin/ui.jsx';

export default function Overview() {
  const navigate = useNavigate();
  const o = useAdmin('/overview', 30000).data || {};
  const t = useAdmin('/traffic', 60000).data || {};
  const a = useAdmin('/api-health', 60000).data || {};
  const s = useAdmin('/system', 30000).data || {};
  const alerts = useAdmin('/alerts?limit=6', 60000).data || [];
  const cost = a.cost || {};

  return (
    <>
      <Section title="At a glance — tap any tile for in-depth stats">
        <div style={grid('150px')}>
          <Metric live label="Live visitors" value={o.traffic?.liveVisitors ?? '—'} sub="active in last 5 min" color={C.cyan} to="/admin/visitors" />
          <Metric label="Visitors today" value={o.traffic?.visitorsToday ?? '—'} sub={`${o.traffic?.viewsToday ?? 0} pageviews`} to="/admin/traffic" />
          <Metric label="Brier score" value={o.predictions?.avgBrier != null ? Number(o.predictions.avgBrier).toFixed(3) : '—'} sub={o.predictions?.winRateWeek != null ? `${o.predictions.winRateWeek}% win rate (7d)` : 'awaiting results'} color={C.accent} to="/admin/predictions" />
          <Metric label="Claude spend (mo)" value={fmtUsd(cost.monthUsd)} sub={`${fmtUsd(cost.todayUsd)} today`} to="/admin/spend" />
          <Metric label="API calls today" value={(a.usage?.apisports?.today ?? 0) + (a.usage?.footballdata?.today ?? 0)} sub="quota & health" to="/admin/api" />
        </div>
      </Section>

      <Section title="Traffic — last 7 days">
        <div style={grid('240px')}>
          <Card onClick={() => navigate('/admin/traffic')}>
            <PanelTitle>Top countries</PanelTitle>
            {(t.countries || []).length === 0 && <Empty />}
            {(t.countries || []).map((c, i) => (
              <Row key={i} left={<span>{flag(c.country)} {c.country}</span>} right={c.visitors} max={t.countries[0]?.visitors} val={c.visitors} />
            ))}
          </Card>
          <Card>
            <PanelTitle>Traffic sources</PanelTitle>
            {(t.referrers || []).length === 0 && <Empty />}
            {(t.referrers || []).map((r, i) => <Row key={i} left={r.source} right={r.hits} max={t.referrers[0]?.hits} val={r.hits} />)}
          </Card>
          <Card>
            <PanelTitle>Devices</PanelTitle>
            {(t.devices || []).length === 0 && <Empty />}
            {(t.devices || []).map((d, i) => <Row key={i} left={d.device} right={d.visitors} max={t.devices[0]?.visitors} val={d.visitors} />)}
          </Card>
        </div>
      </Section>

      <Section title="Engagement today">
        <div style={grid('240px')}>
          <Card>
            <PanelTitle>Most viewed matches</PanelTitle>
            {(t.topMatches || []).length === 0 && <Empty />}
            {(t.topMatches || []).map((m, i) => <Row key={i} left={`${m.home} v ${m.away}`} right={`${m.views} views`} />)}
          </Card>
          <Card>
            <PanelTitle>Interactions</PanelTitle>
            {(t.engagement || []).length === 0 && <Empty />}
            {(t.engagement || []).map((e, i) => <Row key={i} left={e.event_name.replace(/_/g, ' ')} right={e.n} />)}
          </Card>
          <Card>
            <PanelTitle>Predictions</PanelTitle>
            <Row left="Total stored" right={o.predictions?.total ?? '—'} />
            <Row left="Generated today" right={o.predictions?.today ?? '—'} />
            <Row left="Awaiting result" right={o.predictions?.pending ?? '—'} />
          </Card>
        </div>
      </Section>

      <Section title="System health">
        <div style={grid('150px')}>
          <Metric label="Backend uptime" value={uptime(s.uptimeSeconds)} sub={`${s.wsClients ?? 0} live connections`} />
          <Metric label="Database" value={s.dbConnected ? 'UP' : 'DOWN'} color={s.dbConnected ? C.ok : C.bad} sub={s.db ? `${s.db.poolIdle ?? 0} idle / ${s.db.poolTotal ?? 0} conns` : ''} />
          <Metric label="Last prediction" value={timeAgo(s.lastPredictionRun)} sub={s.lastPredictionRun ? '' : 'none yet'} />
          <Metric label="Memory" value={s.memory ? `${s.memory.heapUsedMB}MB` : '—'} sub={s.memory ? `${s.memory.rssMB}MB RSS` : ''} />
          <Metric label="Critical errors 24h" value={s.errorsLast24h ?? 0} color={s.errorsLast24h > 0 ? C.bad : C.text} />
        </div>
      </Section>

      <Section title="Recent alerts">
        <Card>
          {(alerts || []).length === 0 && <Empty label="No alerts. System nominal." />}
          {(alerts || []).map((al) => (
            <div key={al.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: al.severity === 'CRITICAL' ? C.bad : al.severity === 'WARNING' ? C.warn : C.t3 }} />
              <span style={{ fontSize: 12, color: C.t2, flex: 1 }}>{al.message}</span>
              <span style={{ fontSize: 10, color: C.t3, fontFamily: C.mono }}>{timeAgo(al.created_at)}</span>
            </div>
          ))}
        </Card>
      </Section>

      <div style={{ fontSize: 11, color: C.t3, textAlign: 'center', padding: '8px 0 24px' }}>
        Auto-refreshing · {o.generatedAt ? new Date(o.generatedAt).toLocaleTimeString() : ''}
      </div>
    </>
  );
}
