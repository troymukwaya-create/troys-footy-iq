// ─── API USAGE DETAIL ───────────────────────────────────────────────
import React from 'react';
import { useAdmin, Card, Section, Bar, Row, PanelTitle, MiniChart, Empty, grid, timeAgo, C } from '../../components/admin/ui.jsx';

const LIMITS = { apisports: 100, footballdata: null, anthropic: null };
const LABEL = { apisports: 'API-Football', footballdata: 'football-data.org', anthropic: 'Anthropic (Claude)' };

export default function ApiUsage() {
  const d = useAdmin('/api-usage/detail', 60000).data || {};
  const health = useAdmin('/api-health', 60000).data || {};
  const sources = d.bySource || [];

  // group daily by source for charts
  const daily = d.daily || [];
  const bySourceDaily = {};
  for (const r of daily) {
    (bySourceDaily[r.source] = bySourceDaily[r.source] || []).push(r);
  }

  return (
    <>
      <Section title="External API usage today">
        <div style={grid('260px')}>
          <Card>
            <PanelTitle>Quota — API-Football (free tier)</PanelTitle>
            <Bar label="Calls today" used={health.usage?.apisports?.today || 0} limit={100} />
            <div style={{ fontSize: 10, color: C.t3 }}>Free tier resets daily. Upgrade before the World Cup.</div>
          </Card>
          <Card>
            <PanelTitle>football-data.org rate</PanelTitle>
            <Bar label="Last minute" used={health.usage?.footballdata?.lastMinute || 0} limit={10} />
            <div style={{ fontSize: 10, color: C.t3 }}>Today total: {health.usage?.footballdata?.today || 0} calls</div>
          </Card>
        </div>
      </Section>

      <Section title="Usage by source (all time)">
        <Card>
          <div style={{ display: 'flex', fontSize: 10, textTransform: 'uppercase', color: C.t3, padding: '0 0 8px', borderBottom: `1px solid ${C.borderD}`, letterSpacing: '0.06em' }}>
            <span style={{ flex: 1 }}>Source</span>
            <span style={cN}>Today</span><span style={cN}>Total</span><span style={cN}>Fails</span><span style={cN}>Avg ms</span>
            <span style={{ width: 90, textAlign: 'right' }}>Last call</span>
          </div>
          {sources.length === 0 && <div style={{ paddingTop: 10 }}><Empty /></div>}
          {sources.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ flex: 1, color: C.text }}>{LABEL[s.source] || s.source}</span>
              <span style={{ ...cN, fontFamily: C.mono, color: C.t2 }}>{s.today}</span>
              <span style={{ ...cN, fontFamily: C.mono, color: C.text }}>{s.total}</span>
              <span style={{ ...cN, fontFamily: C.mono, color: s.failures > 0 ? C.bad : C.t3 }}>{s.failures}</span>
              <span style={{ ...cN, fontFamily: C.mono, color: C.t2 }}>{s.avg_ms ?? '—'}</span>
              <span style={{ width: 90, textAlign: 'right', fontSize: 10, color: C.t3 }}>{timeAgo(s.last_call)}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Calls — last 14 days">
        <div style={grid('260px')}>
          {Object.keys(bySourceDaily).length === 0 && <Card><Empty /></Card>}
          {Object.entries(bySourceDaily).map(([src, rows]) => (
            <Card key={src}>
              <PanelTitle>{LABEL[src] || src}</PanelTitle>
              <MiniChart data={rows} yKey="calls" height={90} />
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}

const cN = { width: 64, textAlign: 'right' };
