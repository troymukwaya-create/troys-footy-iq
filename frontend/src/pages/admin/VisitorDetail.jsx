// ─── VISITOR DETAIL — one person's full journey ─────────────────────
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdmin, Card, Section, MiniStat, Empty, grid, flag, timeAgo, C } from '../../components/admin/ui.jsx';

const eventLabel = (e) => e === '$pageview' ? 'Viewed page' : e.replace(/_/g, ' ');

export default function VisitorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useAdmin(`/visitors/${encodeURIComponent(id)}`, 0);
  const d = data || {};
  const s = d.summary || {};
  const events = d.events || [];

  return (
    <>
      <button onClick={() => navigate('/admin/visitors')} style={backBtn}>‹ All visitors</button>

      <Section title="Visitor profile">
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text, marginBottom: 14, wordBreak: 'break-all' }}>{id}</div>
          <div style={grid('110px')}>
            <MiniStat label="Location" value={`${flag(s.country)} ${s.country || '—'}`} />
            <MiniStat label="Device" value={s.device || '—'} />
            <MiniStat label="Browser" value={s.browser || '—'} />
            <MiniStat label="OS" value={s.os || '—'} />
            <MiniStat label="Pageviews" value={s.pageviews ?? 0} />
            <MiniStat label="Total events" value={s.events ?? 0} />
            <MiniStat label="First seen" value={timeAgo(s.firstSeen)} />
            <MiniStat label="Last seen" value={timeAgo(s.lastSeen)} />
          </div>
        </Card>
      </Section>

      <Section title={`Journey — ${events.length} events`}>
        <Card>
          {events.length === 0 && <Empty />}
          {events.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < events.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.event_name === '$pageview' ? C.t3 : C.accent, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, textTransform: 'capitalize' }}>
                  {eventLabel(e.event_name)}
                  {e.props?.home_team && <span style={{ color: C.t2 }}> — {e.props.home_team} v {e.props.away_team}</span>}
                </div>
                {e.path && <div style={{ fontSize: 10, color: C.t3, fontFamily: C.mono }}>{e.path}{e.referrer ? ` · from ${e.referrer}` : ''}</div>}
              </div>
              <span style={{ fontSize: 10, color: C.t3, fontFamily: C.mono, flexShrink: 0 }}>{new Date(e.created_at).toLocaleString()}</span>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}

const backBtn = {
  background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.t2,
  fontSize: 12, padding: '5px 12px', cursor: 'pointer', marginBottom: 16,
};
