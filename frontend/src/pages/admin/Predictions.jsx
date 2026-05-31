// ─── PREDICTION INTELLIGENCE DETAIL ─────────────────────────────────
import React from 'react';
import { useAdmin, Card, Section, Metric, Row, PanelTitle, Empty, grid, timeAgo, C } from '../../components/admin/ui.jsx';

const Result = ({ ok }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: ok ? C.ok : C.bad, background: ok ? 'var(--success-muted)' : 'var(--danger-muted)', padding: '1px 6px', borderRadius: 8 }}>
    {ok ? 'HIT' : 'MISS'}
  </span>
);

export default function Predictions() {
  const d = useAdmin('/predictions/detail', 60000).data || {};
  const tot = d.totals || {};

  return (
    <>
      <Section title="Prediction intelligence">
        <div style={grid('150px')}>
          <Metric label="Brier score" value={tot.avg_brier != null ? Number(tot.avg_brier).toFixed(3) : '—'} sub="lower is better" color={C.accent} />
          <Metric label="Evaluated" value={tot.evaluated ?? 0} sub="results known" />
          <Metric label="Total stored" value={tot.total ?? 0} />
          <Metric label="Awaiting result" value={tot.pending ?? 0} color={tot.pending > 0 ? C.warn : C.text} />
        </div>
      </Section>

      <Section title="Accuracy by predicted outcome">
        <div style={grid('200px')}>
          {(d.byOutcome || []).length === 0 && <Card><Empty /></Card>}
          {(d.byOutcome || []).map((o, i) => (
            <Card key={i}>
              <PanelTitle>{o.predicted_outcome || 'Unknown'}</PanelTitle>
              <Row left="Predictions" right={o.n} />
              <Row left="Accuracy" right={`${o.accuracy ?? 0}%`} />
              <Row left="Brier" right={o.brier != null ? Number(o.brier).toFixed(3) : '—'} />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Best & worst calls">
        <div style={grid('240px')}>
          <Card>
            <PanelTitle>Best calls (lowest Brier, correct)</PanelTitle>
            {(d.best || []).length === 0 && <Empty />}
            {(d.best || []).map((m, i) => (
              <div key={i} style={line}>
                <span style={{ fontSize: 12, color: C.t2 }}>{m.match_external_id} · {m.predicted_outcome}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.ok }}>{Number(m.brier_score).toFixed(3)}</span>
              </div>
            ))}
          </Card>
          <Card>
            <PanelTitle>Worst calls (highest Brier, missed)</PanelTitle>
            {(d.worst || []).length === 0 && <Empty />}
            {(d.worst || []).map((m, i) => (
              <div key={i} style={line}>
                <span style={{ fontSize: 12, color: C.t2 }}>{m.match_external_id} · {m.predicted_outcome}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.bad }}>{Number(m.brier_score).toFixed(3)}</span>
              </div>
            ))}
          </Card>
        </div>
      </Section>

      <Section title="Recent evaluated predictions">
        <Card>
          {(d.recent || []).length === 0 && <Empty />}
          {(d.recent || []).map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < d.recent.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <Result ok={m.prediction_correct} />
              <span style={{ flex: 1, fontSize: 12, color: C.t2 }}>{m.match_external_id} — predicted <b style={{ color: C.text }}>{m.predicted_outcome}</b>, actual {m.actual_outcome}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t3 }}>{Number(m.brier_score).toFixed(3)}</span>
              <span style={{ fontSize: 10, color: C.t3 }}>{timeAgo(m.created_at)}</span>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}

const line = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` };
