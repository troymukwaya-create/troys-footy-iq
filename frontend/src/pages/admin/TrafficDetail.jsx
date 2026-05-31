// ─── TRAFFIC DETAIL ─────────────────────────────────────────────────
import React from 'react';
import { useAdmin, Card, Section, Row, PanelTitle, MiniChart, Empty, grid, C } from '../../components/admin/ui.jsx';

export default function TrafficDetail() {
  const detail = useAdmin('/traffic/detail', 60000).data || {};
  const traffic = useAdmin('/traffic', 60000).data || {};

  return (
    <>
      <Section title="Pageviews — last 14 days">
        <Card>
          <PanelTitle>Daily views</PanelTitle>
          <MiniChart data={detail.daily} yKey="views" height={120} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.t3, marginTop: 6 }}>
            <span>{detail.daily?.[0]?.day ? new Date(detail.daily[0].day).toLocaleDateString() : ''}</span>
            <span>today</span>
          </div>
        </Card>
      </Section>

      <Section title="Breakdowns">
        <div style={grid('230px')}>
          <Card>
            <PanelTitle>Top countries</PanelTitle>
            {(traffic.countries || []).length === 0 && <Empty />}
            {(traffic.countries || []).map((c, i) => <Row key={i} left={c.country} right={c.visitors} max={traffic.countries[0]?.visitors} val={c.visitors} />)}
          </Card>
          <Card>
            <PanelTitle>Browsers</PanelTitle>
            {(detail.browsers || []).length === 0 && <Empty />}
            {(detail.browsers || []).map((b, i) => <Row key={i} left={b.browser} right={b.visitors} max={detail.browsers[0]?.visitors} val={b.visitors} />)}
          </Card>
          <Card>
            <PanelTitle>Operating system</PanelTitle>
            {(detail.os || []).length === 0 && <Empty />}
            {(detail.os || []).map((b, i) => <Row key={i} left={b.os} right={b.visitors} max={detail.os[0]?.visitors} val={b.visitors} />)}
          </Card>
          <Card>
            <PanelTitle>Traffic sources</PanelTitle>
            {(traffic.referrers || []).length === 0 && <Empty />}
            {(traffic.referrers || []).map((r, i) => <Row key={i} left={r.source} right={r.hits} max={traffic.referrers[0]?.hits} val={r.hits} />)}
          </Card>
          <Card>
            <PanelTitle>Top pages</PanelTitle>
            {(detail.topPages || []).length === 0 && <Empty />}
            {(detail.topPages || []).map((p, i) => <Row key={i} left={p.path} right={p.views} max={detail.topPages[0]?.views} val={p.views} />)}
          </Card>
          <Card>
            <PanelTitle>Most viewed matches</PanelTitle>
            {(traffic.topMatches || []).length === 0 && <Empty />}
            {(traffic.topMatches || []).map((m, i) => <Row key={i} left={`${m.home} v ${m.away}`} right={`${m.views}`} />)}
          </Card>
        </div>
      </Section>
    </>
  );
}
