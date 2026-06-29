// ─── ENGINE — the prediction model, the ledger, the fan-brain ───────
// The deep model-analytics page: the two-number honesty ledger (pure vs blended
// vs market Brier + CLV), the rolling Brier trend, the fan-brain SHADOW tracks
// (each vs the published model on shared fixtures), per-model breakdown, value
// bets, and the evaluation-run history. Surfaces the performance data the old
// dashboard never showed.

import React from 'react';
import { C, Card, Section, Metric, MiniStat, Empty } from '../../components/admin/ui.jsx';
import { Panel, StatCard, DataTable, LineChart, Badge, Delta, Donut } from '../../components/admin/kit.jsx';
import { Icon } from '../../components/admin/icons.jsx';
import { usePerf } from '../../components/admin/usePerf.js';

const FLAG_LABELS = {
  PERF_ELO_SHADOW: 'perfElo', KNOCKOUT_REGIME_SHADOW: 'knockout',
  SCOUT_SHADOW: 'scout', CALIBRATION_MAP_SHADOW: 'calibration', STYLE_FINGERPRINTS: 'style-fp',
};
const brierColor = (b) => b == null ? C.t3 : b < 0.16 ? C.ok : b < 0.185 ? C.text : b < 0.21 ? C.warn : C.bad;
const pretty = (v) => String(v || '').replace(/^wc-/, '').replace(/-shadow$/, '');

// Three Briers on a shared scale — LONGER bar = sharper (lower Brier).
function LedgerBars({ ledger }) {
  if (!ledger || ledger.pureModel == null) return <Empty label="No scored matches yet" />;
  const rows = [
    { k: 'Market only', v: ledger.marketOnly, color: C.cyan },
    { k: 'Published (blended)', v: ledger.blended, color: C.accent, badge: 'LIVE' },
    { k: 'Pure model', v: ledger.pureModel, color: C.t2 },
  ].filter(r => r.v != null);
  const vals = rows.map(r => r.v);
  const lo = Math.min(...vals) * 0.96, hi = Math.max(...vals) * 1.04;
  const w = (v) => `${Math.max(6, ((hi - v) / (hi - lo)) * 100)}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {rows.map(r => (
        <div key={r.k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.t2, display: 'flex', alignItems: 'center', gap: 7 }}>
              {r.k}{r.badge && <Badge tone="accent" solid style={{ fontSize: 8.5, padding: '2px 6px' }}>{r.badge}</Badge>}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: r.color }}>{r.v?.toFixed(4)}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <div style={{ width: w(r.v), height: '100%', background: r.color, borderRadius: 4, transition: 'width 700ms ease' }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2 }}>Brier score — lower is sharper. Longer bar = better. Published number is the blended one.</div>
    </div>
  );
}

export default function Engine() {
  const perf = usePerf('/', 60000).data || {};
  const shadow = usePerf('/shadow', 60000).data || {};
  const rolling = usePerf('/rolling?n=60', 60000).data || {};
  const value = usePerf('/value-bets', 120000).data || {};

  const ledger = shadow.ledger || perf.ledger || {};
  const overall = perf.overall || {};
  const flags = shadow.flags || {};
  const tracks = shadow.shadow?.tracks || [];
  const anyFlagOn = Object.values(flags).some(Boolean);
  const clv = ledger.clv || {};

  // Rolling Brier → chronological series.
  const series = [...(rolling.predictions || [])].reverse().map(p => ({ b: Number(p.brier_score) }));

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', color: C.accent, background: C.accentMuted, border: `1px solid ${C.accent}` }}>
          <Icon name="brain" size={20} />
        </span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px' }}>Prediction Engine</div>
          <div style={{ fontSize: 12, color: C.t3 }}>wc-elo-market-v1 · {overall.total_predictions || ledger.n || 0} scored · the honesty ledger + fan-brain shadow</div>
        </div>
      </div>

      {/* ── Headline model KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <StatCard icon="target" tone="accent" label="Published Brier" value={ledger.blended?.toFixed(4) ?? '—'} color={brierColor(ledger.blended)} sub="blended · live" />
        <StatCard icon="trophy" tone="ok" label="Win rate" value={overall.accuracy ? `${overall.accuracy}%` : '—'} sub={`${overall.correct || 0}/${overall.total_predictions || 0}`} />
        <StatCard icon="scale" tone="cyan" label="Beat the close" value={clv.beatCloseRate != null ? `${clv.beatCloseRate}%` : '—'} sub={`CLV · ${clv.n || 0} mkts`} color={clv.beatCloseRate >= 50 ? C.ok : C.warn} />
        <StatCard icon="dollar" tone="warn" label="Value-bet ROI" value={value.roi != null ? `${value.roi > 0 ? '+' : ''}${value.roi}%` : '—'} sub={`${value.valueBets || 0} bets · ${value.hitRate ?? 0}% hit`} color={value.roi > 0 ? C.ok : value.roi < 0 ? C.bad : C.text} />
      </div>

      {/* ── Ledger + Rolling ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Panel title="The honesty ledger" icon="scale" right={<Badge tone="neutral">{ledger.n || 0} matches</Badge>}>
          <LedgerBars ledger={ledger} />
          <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <MiniStat label="CLV beat-close" value={clv.beatCloseRate != null ? `${clv.beatCloseRate}%` : '—'} color={clv.beatCloseRate >= 50 ? C.ok : C.warn} />
            <MiniStat label="Mean Δ vs close" value={clv.meanDeltaPts != null ? `${clv.meanDeltaPts > 0 ? '+' : ''}${clv.meanDeltaPts} pts` : '—'} color={clv.meanDeltaPts > 0 ? C.ok : C.bad} />
            <MiniStat label="Log loss" value={overall.avg_log_loss ?? '—'} />
          </div>
        </Panel>

        <Panel title="Rolling Brier" icon="activity" right={<Badge tone="neutral">last {series.length}</Badge>}>
          <LineChart data={series} yKey="b" height={120} color={C.accent} baseline={ledger.blended} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: C.t3 }}>
            <span>per-match Brier (lower = sharper)</span>
            <span style={{ fontFamily: C.mono }}>avg {rolling.rolling?.avgBrier ?? ledger.blended?.toFixed(4) ?? '—'}</span>
          </div>
        </Panel>
      </div>

      {/* ── FAN-BRAIN SHADOW ── */}
      <Section title="Fan-Brain — shadow engine" right={
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Object.entries(FLAG_LABELS).map(([k, lbl]) => (
            <Badge key={k} tone={flags[k] ? 'ok' : 'neutral'}>{flags[k] ? '● ' : '○ '}{lbl}</Badge>
          ))}
        </div>
      }>
        <Card>
          {!anyFlagOn ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ color: C.t3, marginTop: 2 }}><Icon name="power" size={20} /></span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Shadow engine dormant</div>
                <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6, maxWidth: 620 }}>
                  The fan-brain (perfElo, knockout regime, market-blind scout, calibration) is deployed but <b>off</b>. It runs in parallel and is scored on the PURE model only — it never touches the published Brier. To start it learning from live matches, set the <code style={{ fontFamily: C.mono, color: C.accent }}>*_SHADOW</code> flags in Render → Environment. Tracks then appear here, each judged against the published model on the same fixtures.
                </div>
              </div>
            </div>
          ) : tracks.length === 0 ? (
            <Empty label="Flags on — waiting for the first shadow matches to score." />
          ) : (
            <DataTable
              columns={[
                { key: 'version', label: 'Track', render: r => <span style={{ fontWeight: 600, color: C.text }}>{pretty(r.version)}</span> },
                { key: 'n', label: 'n', align: 'right', mono: true, sortable: true },
                { key: 'brier', label: 'Brier', align: 'right', mono: true, sortable: true, render: r => <span style={{ color: brierColor(r.brier) }}>{r.brier?.toFixed(4)}</span> },
                { key: 'vsPure', label: 'vs pure', align: 'right', mono: true, render: r => <span style={{ color: C.t2 }}>{r.vsPure?.toFixed(4)}</span> },
                { key: 'deltaVsPure', label: 'Δ', align: 'right', sortable: true, render: r => <Delta value={r.deltaVsPure} digits={4} goodDirection="up" /> },
                { key: 'beatsPure', label: '', align: 'right', render: r => r.beatsPure ? <Badge tone="ok">beats pure</Badge> : <Badge tone="neutral">—</Badge> },
              ]}
              rows={tracks}
            />
          )}
        </Card>
      </Section>

      {/* ── Per-model + runs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Panel title="Models" icon="layers">
          {(perf.perModel || []).length === 0 ? <Empty /> : (perf.perModel || []).map(m => (
            <div key={m.model_version} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model_version}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>{m.total_predictions} scored · {m.accuracy}% acc</div>
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: brierColor(Number(m.avg_brier)) }}>{m.avg_brier}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Value bets" icon="dollar" right={<Badge tone={value.roi > 0 ? 'ok' : 'neutral'}>{value.valueBets || 0} bets</Badge>}>
          <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
            <Donut value={(value.hitRate || 0) / 100} center={`${value.hitRate ?? 0}%`} label="hit rate" color={C.ok} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
              <MiniStat label="ROI (flat stake)" value={value.roi != null ? `${value.roi > 0 ? '+' : ''}${value.roi}%` : '—'} color={value.roi > 0 ? C.ok : value.roi < 0 ? C.bad : C.text} />
              <MiniStat label="Won / placed" value={`${value.won ?? 0} / ${value.valueBets ?? 0}`} />
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: C.t3 }}>Edges &gt; 3% on the model's pick, theoretical flat-stake return.</div>
        </Panel>
      </div>

      {/* ── Eval runs ── */}
      <Panel title="Evaluation runs" icon="refresh">
        <DataTable
          columns={[
            { key: 'model_version', label: 'Model', render: r => <span style={{ color: C.t2 }}>{r.model_version}</span> },
            { key: 'run_type', label: 'Type' },
            { key: 'matches_evaluated', label: 'n', align: 'right', mono: true },
            { key: 'brier_score', label: 'Brier', align: 'right', mono: true, render: r => <span style={{ color: brierColor(Number(r.brier_score)) }}>{Number(r.brier_score).toFixed(4)}</span> },
            { key: 'log_loss', label: 'LogLoss', align: 'right', mono: true, render: r => Number(r.log_loss).toFixed(3) },
            { key: 'ece', label: 'ECE', align: 'right', mono: true, render: r => r.ece != null ? Number(r.ece).toFixed(3) : '—' },
            { key: 'created_at', label: 'When', align: 'right', render: r => new Date(r.created_at).toLocaleDateString() },
          ]}
          rows={perf.runs || []}
          maxRows={10}
          empty="No evaluation runs yet"
        />
      </Panel>
    </div>
  );
}
