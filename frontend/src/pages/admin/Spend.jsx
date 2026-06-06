// ─── SPEND — subscription stack + live Claude spend ─────────────────
import React from 'react';
import { useAdmin, Card, Section, Metric, Row, PanelTitle, MiniChart, Empty, grid, fmtUsd, C } from '../../components/admin/ui.jsx';

// The Footy IQ subscription ledger — the World Cup 2026 cost command center.
// Code-defined (these are known fixed costs, not telemetry). Live Claude
// spend below is real, from api_cost_log. Keep this in sync with the vault:
// "05 - Business Model/04 - Finance & Metrics/Pre-World-Cup Funding Plan".
const SUBS = [
  { name: 'Render — PostgreSQL',     powers: 'Stores every prediction + the Brier feedback loop', monthly: 7,  status: 'pay',    link: 'render.com' },
  { name: 'Render — Backend (Node)', powers: 'Always-on API; no cold starts during WC traffic',   monthly: 7,  status: 'pay',    link: 'render.com' },
  { name: 'Domain · oddyssa.com',    powers: 'Brand URL — bought, connecting to Vercel',          monthly: 1,  status: 'active', link: 'vercel.com' },
  { name: 'API-Football · Pro',      powers: 'All 104 WC fixtures, lineups, events, standings',    monthly: 19, status: 'wire',   link: 'api-football.com/pricing' },
  { name: 'The Odds API · 20K',      powers: 'Pre-match odds → fixes the broken value-edge layer', monthly: 30, status: 'wire',   link: 'the-odds-api.com' },
  { name: 'Claude API (Anthropic)',  powers: 'AI match verdicts',                                  monthly: 50, status: 'active', link: 'anthropic.com/startups — apply $50K credits' },
  { name: 'football-data.org',       powers: 'Free backup fixtures / standings',                   monthly: 0,  status: 'active', link: 'football-data.org' },
  { name: 'ClubElo + Open-Meteo',    powers: 'Team Elo strength + match weather',                  monthly: 0,  status: 'active', link: 'free' },
  { name: 'Vercel (frontend)',       powers: 'Hosts the React app (hobby tier)',                   monthly: 0,  status: 'active', link: 'vercel.com/startups' },
  { name: 'Beehiiv / Substack',      powers: 'Newsletter capture for launch',                      monthly: 0,  status: 'plan',   link: 'beehiiv.com' },
];

const STATUS = {
  pay:    { label: 'PAY TONIGHT', color: C.accent },
  wire:   { label: 'WIRE THIS WK', color: C.warn },
  active: { label: 'ACTIVE',       color: C.ok },
  plan:   { label: 'PLANNED',      color: C.t3 },
};
const sum = (pred) => SUBS.filter(pred).reduce((a, s) => a + s.monthly, 0);
const Pill = ({ s }) => {
  const v = STATUS[s] || STATUS.plan;
  return <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: v.color, border: `1px solid ${v.color}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{v.label}</span>;
};

function SubscriptionLedger() {
  const payTonight = sum(s => s.status === 'pay');                       // Render x2 + domain
  const dataTier   = sum(s => s.status === 'wire');                      // API-Football + Odds
  const fullBurn   = sum(() => true);                                    // everything when WC-ready
  return (
    <Section title="Subscription stack — World Cup 2026 burn">
      <div style={{ ...grid('170px'), marginBottom: 12 }}>
        <Metric label="Pay tonight" value={fmtUsd(payTonight)} sub="Render DB + backend + domain" color={C.accent} />
        <Metric label="+ Data tier (this week)" value={fmtUsd(dataTier)} sub="API-Football Pro + The Odds API" color={C.warn} />
        <Metric label="Full monthly (WC-ready)" value={fmtUsd(fullBurn)} sub={`≈ ${fmtUsd(fullBurn - 50)} with Anthropic credits`} />
      </div>
      <Card>
        <div style={{ display: 'flex', fontSize: 10, textTransform: 'uppercase', color: C.t3, padding: '0 0 8px', borderBottom: `1px solid ${C.borderD}`, letterSpacing: '0.06em' }}>
          <span style={{ flex: 1 }}>Service</span>
          <span style={{ width: 110, textAlign: 'right' }}>Status</span>
          <span style={{ width: 70, textAlign: 'right' }}>/mo</span>
        </div>
        {SUBS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text }}>{s.name}</div>
              <div style={{ fontSize: 11, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.powers} · <span style={{ color: C.t2 }}>{s.link}</span></div>
            </div>
            <span style={{ width: 110, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}><Pill s={s.status} /></span>
            <span style={{ width: 70, textAlign: 'right', fontFamily: C.mono, fontSize: 13, color: s.monthly > 0 ? C.text : C.t3 }}>{s.monthly > 0 ? fmtUsd(s.monthly) : 'free'}</span>
          </div>
        ))}
      </Card>
    </Section>
  );
}

export default function Spend() {
  const d = useAdmin('/spend/detail', 60000).data || {};
  const t = d.totals || {};
  const cacheRate = Number(t.input_tokens) > 0 ? ((Number(t.cached_tokens) / Number(t.input_tokens)) * 100).toFixed(1) : 0;

  return (
    <>
      <SubscriptionLedger />

      <Section title="Claude (Anthropic) spend — live">
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
