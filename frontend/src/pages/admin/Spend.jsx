// ─── CLAUDE SPEND DETAIL ────────────────────────────────────────────
import React from 'react';
import { useAdmin, Card, Section, Metric, Row, PanelTitle, MiniChart, Empty, grid, fmtUsd, C } from '../../components/admin/ui.jsx';

export default function Spend() {
  const d = useAdmin('/spend/detail', 60000).data || {};
  const t = d.totals || {};
  const cacheRate = Number(t.input_tokens) > 0 ? ((Number(t.cached_tokens) / Number(t.input_tokens)) * 100).toFixed(1) : 0;

  return (
    <>
      <Section title="Claude (Anthropic) spend">
        <div style={grid('150px')}>
          <Metric label="Total spend" value={fmtUsd(t.total_usd)} sub={`${t.calls ?? 0} calls`} color={C.accent} />
          <Metric label="Input tokens" value={Number(t.input_tokens || 0).toLocaleString()} />
          <Metric label="Output tokens" value={Number(t.output_tokens || 0).toLocaleString()} />
          <Metric label="Cache hit rate" value={`${cacheRate}%`} color={cacheRate > 0 ? C.ok : C.warn} sub={cacheRate > 0 ? 'saving money' : 'enable caching'} />
        </div>
      </Section>

      <Section title="Spend — last 30 days">
        <Card>
          <PanelTitle>Daily cost (USD)</PanelTitle>
          <MiniChart data={d.daily} yKey="usd" height={120} color={C.accent} />
        </Card>
      </Section>

      <Section title="By call type">
        <Card>
          <div style={{ display: 'flex', fontSize: 10, textTransform: 'uppercase', color: C.t3, padding: '0 0 8px', borderBottom: `1px solid ${C.borderD}`, letterSpacing: '0.06em' }}>
            <span style={{ flex: 1 }}>Endpoint</span><span style={{ width: 70, textAlign: 'right' }}>Calls</span><span style={{ width: 90, textAlign: 'right' }}>Cost</span>
          </div>
          {(d.byEndpoint || []).length === 0 && <div style={{ paddingTop: 10 }}><Empty /></div>}
          {(d.byEndpoint || []).map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ flex: 1, color: C.t2 }}>{e.endpoint}</span>
              <span style={{ width: 70, textAlign: 'right', fontFamily: C.mono, color: C.text }}>{e.calls}</span>
              <span style={{ width: 90, textAlign: 'right', fontFamily: C.mono, color: C.accent }}>{fmtUsd(e.usd)}</span>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}
