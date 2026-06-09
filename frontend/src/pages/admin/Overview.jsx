// ─── OVERVIEW — clickable KPI tiles → drill-down pages ──────────────
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAdmin, Metric, Card, Section, Row, PanelTitle, Empty, grid, fmtUsd, flag, uptime, timeAgo, C } from '../../components/admin/ui.jsx';
import adminApi from '../../api/adminClient.js';

// Dated platform updates (engine/feature ships + incoming), with CEO approval.
function PlatformUpdates() {
  const qc = useQueryClient();
  const updates = useAdmin('/updates', 60000).data || [];
  const setApprove = async (id, approve) => {
    try { await adminApi.post(`/updates/${id}/approve`, { approve }); qc.invalidateQueries({ queryKey: ['adm'] }); } catch { /* ignore */ }
  };
  if (!updates.length) return null;
  return (
    <Section title="Platform updates — what's shipped & incoming">
      <Card>
        {updates.map((u, i) => (
          <div key={u.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < updates.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                {u.title}
                {u.status === 'approved' && <span style={{ marginLeft: 8, fontSize: 9, color: C.ok, background: 'var(--success-muted)', padding: '1px 6px', borderRadius: 8 }}>APPROVED</span>}
              </div>
              {u.body && <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{u.body}</div>}
              <div style={{ fontSize: 10, color: C.t3, fontFamily: C.mono, marginTop: 3 }}>
                {new Date(u.shipped_at).toLocaleString()} · {u.category}
              </div>
            </div>
            <button onClick={() => setApprove(u.id, u.status !== 'approved')}
              style={{ alignSelf: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600,
                color: u.status === 'approved' ? C.t3 : C.accent, background: 'none',
                border: `1px solid ${u.status === 'approved' ? C.border : C.accent}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
              {u.status === 'approved' ? 'Unapprove' : 'Approve'}
            </button>
          </div>
        ))}
      </Card>
    </Section>
  );
}

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
      <StatusBanner o={o} s={s} a={a} alertCount={o.openAlerts} />

      <PlatformUpdates />

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

// ─── SYSTEM STATUS BANNER — flags anything wrong, loud and at the top ──────────
function StatusBanner({ o, s, a, alertCount }) {
  const issues = [];
  const dbDown = o.dbConnected === false || s.dbConnected === false;
  if (dbDown) issues.push({ sev: 'critical', text: 'Database disconnected — predictions are NOT being saved' });
  if ((s.errorsLast24h || 0) > 0) issues.push({ sev: 'critical', text: `${s.errorsLast24h} critical error${s.errorsLast24h > 1 ? 's' : ''} in the last 24h` });
  if (s.lastPredictionRun) {
    const ageH = (Date.now() - new Date(s.lastPredictionRun).getTime()) / 3600000;
    if (ageH > 26) issues.push({ sev: 'warning', text: `No new prediction in ${Math.round(ageH)}h — check the scheduler` });
  }
  const apf = a.usage?.apisports;
  if (apf && apf.failuresToday > 0) issues.push({ sev: 'warning', text: `${apf.failuresToday} API-Football request${apf.failuresToday > 1 ? 's' : ''} failed today` });
  if ((alertCount || 0) > 0) issues.push({ sev: 'warning', text: `${alertCount} unacknowledged alert${alertCount > 1 ? 's' : ''}` });

  const critical = issues.some(i => i.sev === 'critical');
  const ok = issues.length === 0;
  const color = ok ? C.ok : critical ? C.bad : C.warn;
  const bg = ok ? 'var(--success-muted)' : critical ? 'var(--danger-muted)' : 'var(--warning-muted)';

  return (
    <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} className={ok ? '' : 'animate-pulse'} />
        <span style={{ fontSize: 15, fontWeight: 800, color }}>
          {ok ? 'All systems operational' : critical ? `${issues.length} issue${issues.length > 1 ? 's' : ''} need attention` : `${issues.length} warning${issues.length > 1 ? 's' : ''}`}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3, fontFamily: C.mono }}>
          DB {(s.dbConnected ?? o.dbConnected) ? 'up' : 'down'} · uptime {uptime(s.uptimeSeconds)} · {s.wsClients ?? 0} live
        </span>
      </div>
      {!ok && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {issues.map((i, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: C.t2 }}>
              <span style={{ color: i.sev === 'critical' ? C.bad : C.warn, fontWeight: 800, width: 14, textAlign: 'center', flexShrink: 0 }}>{i.sev === 'critical' ? '✕' : '!'}</span>
              {i.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
