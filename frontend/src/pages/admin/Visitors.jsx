// ─── VISITORS — every real visitor, who they are, what they did ─────
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, Metric, Card, Section, Empty, grid, flag, timeAgo, C } from '../../components/admin/ui.jsx';

export default function Visitors() {
  const navigate = useNavigate();
  const { data, isLoading } = useAdmin('/visitors', 20000);
  const d = data || {};
  const s = d.summary || {};
  const visitors = d.visitors || [];

  return (
    <>
      <Section title="Visitors — last 7 days">
        <div style={grid('150px')}>
          <Metric live label="Live now" value={s.live ?? 0} sub="active in last 5 min" color={C.cyan} />
          <Metric label="Total visitors" value={s.total ?? 0} sub="unique people" />
          <Metric label="New" value={s.newVisitors ?? 0} sub="first visit < 24h" color={C.ok} />
          <Metric label="Returning" value={s.returning ?? 0} sub="seen before" />
        </div>
      </Section>

      <Section title={`Who is on the site (${visitors.length})`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* header row */}
          <div style={hdr}>
            <span style={{ flex: 2 }}>Visitor</span>
            <span style={col}>Location</span>
            <span style={col}>Device</span>
            <span style={col}>Browser</span>
            <span style={colN}>Views</span>
            <span style={colN}>Actions</span>
            <span style={col}>Last seen</span>
          </div>

          {isLoading && <div style={{ padding: 16, color: C.t3, fontSize: 12 }}>Loading…</div>}
          {!isLoading && visitors.length === 0 && (
            <div style={{ padding: 20 }}>
              <Empty label="No real visitors yet. Turn on demo data (top-right) to preview this view, or deploy the site so real traffic is tracked." />
            </div>
          )}

          {visitors.map((v) => (
            <div key={v.visitor_id} onClick={() => navigate(`/admin/visitors/${encodeURIComponent(v.visitor_id)}`)}
              style={rowStyle}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {v.live
                  ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.ok, boxShadow: `0 0 6px ${C.ok}`, flexShrink: 0 }} />
                  : <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.t3, flexShrink: 0 }} />}
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.visitor_id.slice(0, 13)}…
                </span>
                {v.is_new && <span style={tag}>NEW</span>}
              </span>
              <span style={col}>{flag(v.country)} {v.country || '—'}</span>
              <span style={{ ...col, textTransform: 'capitalize' }}>{v.device || '—'}</span>
              <span style={col}>{v.browser || '—'}</span>
              <span style={{ ...colN, fontFamily: C.mono, color: C.text }}>{v.pageviews}</span>
              <span style={{ ...colN, fontFamily: C.mono, color: v.interactions > 0 ? C.accent : C.t3 }}>{v.interactions}</span>
              <span style={{ ...col, color: v.live ? C.ok : C.t3 }}>{v.live ? 'now' : timeAgo(v.last_seen)}</span>
            </div>
          ))}
        </Card>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Click any visitor to see their full journey through the site.</div>
      </Section>
    </>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
  borderBottom: `1px solid ${C.borderD}`, fontSize: 10, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: C.t3, fontWeight: 600,
};
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px',
  borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, color: C.t2,
  transition: 'background 120ms ease',
};
const col = { flex: 1, fontSize: 12, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const colN = { width: 60, textAlign: 'right', fontSize: 12 };
const tag = { fontSize: 8, fontWeight: 700, color: C.ok, background: 'var(--success-muted)', padding: '1px 5px', borderRadius: 8, flexShrink: 0 };
