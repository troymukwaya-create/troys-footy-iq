// ─── MISSION CONTROL — the CEO command-center hub ───────────────────
// One screen for the state of the whole business: the moat (Brier), audience,
// revenue, the fan-brain engine room, system health, tonight's slate, and a live
// activity stream. Every tile is clickable into its full drill-down page.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, C, Card, Section, MiniStat, Empty, fmtUsd, uptime, timeAgo, Trend } from '../../components/admin/ui.jsx';
import { Panel, StatCard, Badge, LiveDot } from '../../components/admin/kit.jsx';
import { Icon } from '../../components/admin/icons.jsx';
import { usePerf } from '../../components/admin/usePerf.js';

const FEED_ICON = { lock: 'target', grade: 'check', subscriber: 'users', email: 'mail', growth: 'trendUp', social: 'globe' };
const FEED_TONE = { lock: C.accent, grade: C.ok, subscriber: C.cyan, email: C.warn, growth: C.ok, social: C.t2 };
const brierColor = (b) => b == null ? C.t3 : b < 0.16 ? C.ok : b < 0.185 ? C.text : b < 0.21 ? C.warn : C.bad;

// Compact hero status — green/amber/red like the full banner, but a single line.
function Hero({ o, s, wcLive }) {
  const dbDown = o.dbConnected === false || s.dbConnected === false;
  const errs = s.errorsLast24h || 0;
  const issues = (dbDown ? 1 : 0) + (errs > 0 ? 1 : 0) + (o.openAlerts || 0);
  const color = issues === 0 ? C.ok : dbDown || errs ? C.bad : C.warn;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }}>
          Command Center
          {wcLive && <Badge tone="accent" solid><Icon name="zap" size={10} /> World Cup live</Badge>}
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>Everything happening across Oddyessa, in real time.</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderRadius: 12, background: `color-mix(in srgb, ${color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color }}>
          <LiveDot color={color} size={9} />{issues === 0 ? 'All systems operational' : `${issues} need${issues === 1 ? 's' : ''} attention`}
        </span>
        <span style={{ fontSize: 11, color: C.t3, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
          uptime {uptime(s.uptimeSeconds)} · {s.wsClients ?? 0} live
        </span>
      </div>
    </div>
  );
}

export default function MissionControl() {
  const navigate = useNavigate();
  const o = useAdmin('/overview', 30000).data || {};
  const s = useAdmin('/system', 30000).data || {};
  const a = useAdmin('/api-health', 60000).data || {};
  const g = useAdmin('/growth', 60000).data || {};
  const tonight = useAdmin('/tonight', 20000).data || [];
  const feed = useAdmin('/ops-feed?hours=24', 30000).data || [];
  const shadow = usePerf('/shadow', 60000).data || {};

  const tr = o.traffic || {}, pr = o.predictions || {}, cost = a.cost || {};
  const ledger = shadow.ledger || {}, flags = shadow.flags || {}, clv = ledger.clv || {};
  const subs = g.subscribers || {};
  const anyFlagOn = Object.values(flags).some(Boolean);
  const flagsOn = Object.values(flags).filter(Boolean).length;
  const tracks = shadow.shadow?.tracks || [];
  const conns = a.connections || {};
  const connList = Object.entries(conns);

  return (
    <div>
      <Hero o={o} s={s} wcLive={o.worldCupLive} />

      {/* ── Headline KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon="target" tone="accent" label="Published Brier" value={ledger.blended?.toFixed(4) ?? (pr.avgBrier != null ? Number(pr.avgBrier).toFixed(3) : '—')} color={brierColor(ledger.blended)} sub="the moat · lower better" to="/admin/engine" />
        <StatCard icon="trophy" tone="ok" label="Win rate 7d" value={pr.winRateWeek != null ? `${pr.winRateWeek}%` : '—'} sub={`${pr.total ?? 0} predictions`} to="/admin/predictions" />
        <StatCard icon="users" tone="cyan" label="Live visitors" value={tr.liveVisitors ?? '—'} sub="active now" live to="/admin/visitors" />
        <StatCard icon="globe" tone="accent" label="Visitors 24h" value={tr.visitors24h ?? '—'} trend={<Trend curr={tr.visitors24h} prev={tr.visitorsPrev24h} goodDirection="up" label="vs prev" />} sub={`${tr.views24h ?? 0} views`} to="/admin/traffic" />
        <StatCard icon="mail" tone="ok" label="Subscribers" value={subs.active ?? '—'} trend={<Trend curr={subs.last7d} prev={subs.prev7d} goodDirection="up" label="7d" />} to="/admin/business" />
        <StatCard icon="dollar" tone="warn" label="Spend (mo)" value={fmtUsd(cost.monthUsd)} sub={`${fmtUsd(cost.todayUsd)} today`} to="/admin/spend" />
        <StatCard icon="scale" tone="cyan" label="Beat the close" value={clv.beatCloseRate != null ? `${clv.beatCloseRate}%` : '—'} sub="CLV vs market" color={clv.beatCloseRate >= 50 ? C.ok : C.warn} to="/admin/engine" />
        <StatCard icon="server" tone={s.dbConnected ? 'ok' : 'bad'} label="System" value={s.dbConnected ? 'UP' : 'DOWN'} color={s.dbConnected ? C.ok : C.bad} sub={`${s.memory?.heapUsedMB ?? '—'}MB · ${s.errorsLast24h ?? 0} err`} to="/admin/api" />
      </div>

      {/* ── Engine Room ── */}
      <Section title="Engine room — the prediction model" right={<button onClick={() => navigate('/admin/engine')} style={linkBtn}>Open engine <Icon name="arrow" size={12} /></button>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <Card onClick={() => navigate('/admin/engine')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Icon name="scale" size={15} color={C.accent} /><span style={{ fontSize: 12, fontWeight: 700 }}>The honesty ledger</span>
              <Badge tone="neutral" style={{ marginLeft: 'auto' }}>{ledger.n || 0} matches</Badge>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <MiniStat label="Pure model" value={ledger.pureModel?.toFixed(4) ?? '—'} color={C.t2} />
              <MiniStat label="Published" value={ledger.blended?.toFixed(4) ?? '—'} color={C.accent} />
              <MiniStat label="Market" value={ledger.marketOnly?.toFixed(4) ?? '—'} color={C.cyan} />
              <MiniStat label="Beat close" value={clv.beatCloseRate != null ? `${clv.beatCloseRate}%` : '—'} color={clv.beatCloseRate >= 50 ? C.ok : C.warn} />
            </div>
          </Card>

          <Card onClick={() => navigate('/admin/engine')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Icon name="brain" size={15} color={anyFlagOn ? C.ok : C.t3} /><span style={{ fontSize: 12, fontWeight: 700 }}>Fan-brain shadow</span>
              <Badge tone={anyFlagOn ? 'ok' : 'neutral'} style={{ marginLeft: 'auto' }}>{anyFlagOn ? `${flagsOn} on` : 'dormant'}</Badge>
            </div>
            {anyFlagOn ? (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <MiniStat label="Tracks scoring" value={tracks.length} />
                <MiniStat label="Beating pure" value={tracks.filter(t => t.beatsPure).length} color={C.ok} />
                <MiniStat label="Best Δ vs pure" value={tracks.length ? (Math.max(...tracks.map(t => t.deltaVsPure || 0))).toFixed(4) : '—'} color={C.ok} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
                Deployed and dormant — scored on the pure model only, never touches the published Brier. Flip the <code style={{ fontFamily: C.mono, color: C.accent }}>*_SHADOW</code> flags in Render to start it learning from live matches.
              </div>
            )}
          </Card>
        </div>
      </Section>

      {/* ── Tonight + Activity ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 24 }}>
        <Panel title="Tonight" icon="zap" right={<button onClick={() => navigate('/admin/ops')} style={linkBtn}>Ops <Icon name="arrow" size={11} /></button>}>
          {(tonight || []).length === 0 ? <Empty label="No fixtures in the next 26h." /> : (tonight || []).slice(0, 6).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.home} <span style={{ color: C.t3 }}>v</span> {m.away}</div>
                <div style={{ fontSize: 10.5, color: C.t3, fontFamily: C.mono }}>{m.ko ? new Date(m.ko).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} {m.status ? `· ${m.status}` : ''}</div>
              </div>
              <StageDots stages={m.stages} />
            </div>
          ))}
        </Panel>

        <Panel title="Live activity" icon="pulse" right={<button onClick={() => navigate('/admin/ops')} style={linkBtn}>All <Icon name="arrow" size={11} /></button>}>
          {(feed || []).length === 0 ? <Empty /> : (feed || []).slice(0, 9).map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < 8 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ color: FEED_TONE[f.type] || C.t3 }}><Icon name={FEED_ICON[f.type] || 'pulse'} size={13} /></span>
              <span style={{ fontSize: 12, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
              {f.hit != null && <Badge tone={f.hit ? 'ok' : 'bad'}>{f.hit ? 'hit' : 'miss'}</Badge>}
              <span style={{ fontSize: 10, color: C.t3, fontFamily: C.mono, flexShrink: 0 }}>{timeAgo(f.at)}</span>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── API connections ── */}
      {connList.length > 0 && (
        <Section title="Data pipes" right={<button onClick={() => navigate('/admin/api')} style={linkBtn}>API health <Icon name="arrow" size={11} /></button>}>
          <Card>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {connList.map(([key, c]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: !c.wired ? C.t3 : c.status === 'active' || c.active ? C.ok : c.status === 'error' ? C.bad : C.warn }} />
                  <span style={{ fontSize: 12, color: C.t2 }}>{c.label || key}</span>
                  <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.mono }}>{c.wired ? `${c.callsToday ?? 0} today` : 'off'}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}

      <div style={{ fontSize: 11, color: C.t3, textAlign: 'center', padding: '16px 0 24px' }}>
        Auto-refreshing live · {o.generatedAt ? new Date(o.generatedAt).toLocaleTimeString() : ''}
      </div>
    </div>
  );
}

const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 };

function StageDots({ stages }) {
  const order = [['priced', 'Priced'], ['callPosted', 'Call'], ['live', 'Live'], ['graded', 'Graded'], ['receiptPosted', 'Receipt']];
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} title={order.map(([k, l]) => `${l}: ${stages?.[k] ? '✓' : '·'}`).join('  ')}>
      {order.map(([k]) => <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: stages?.[k] ? C.ok : 'rgba(255,255,255,0.12)' }} />)}
    </div>
  );
}
