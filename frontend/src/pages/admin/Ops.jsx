// ─── MISSION CONTROL — see everything, push on anything ─────────────
// The CEO's live cockpit: tonight's pipeline per match (priced → call
// posted → live → graded → receipt), a unified ops feed of everything
// the machine does, the growth funnel, and the buttons.
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdmin, Card, Section, Metric, grid, timeAgo, C } from '../../components/admin/ui.jsx';
import adminApi from '../../api/adminClient.js';
import client from '../../api/client.js';

const TYPE_COLOR = {
  lock: C.accent, grade: C.ok, social: '#5BC0BE',
  subscriber: C.warn, email: C.warn, growth: '#EAB308',
};

// ─── Tonight board ───────────────────────────────────────────────────
// Admin /tonight knows what the DB has seen (locks, grades, posts); the
// public upcoming feed knows games the engine has priced but not yet
// stored. Merge both so tomorrow's slate is visible all day.
function Tonight() {
  const dbRows = useAdmin('/tonight', 15000).data || [];
  const { data: pub } = useQuery({
    queryKey: ['adm-upcoming'],
    queryFn: async () => (await client.get('/fixtures/upcoming')).data?.fixtures || [],
    refetchInterval: 60000,
  });
  const known = new Set(dbRows.map(r => r.id));
  const horizon = Date.now() + 26 * 3600 * 1000;
  const extra = (pub || [])
    .filter(f => f.league?.code === 'WC' && !known.has(f.id)
      && new Date(f.date) > new Date() && new Date(f.date).getTime() < horizon)
    .map(f => ({
      id: f.id, ko: f.date, status: f.status, home: f.homeTeam?.name, away: f.awayTeam?.name,
      probs: f.probability?.probabilities || null, risk: f.probability?.riskLevel,
      stages: { priced: !!f.probability?.probabilities, callPosted: false, live: false, graded: false, receiptPosted: false },
    }));
  const rows = [...dbRows, ...extra].sort((a, b) => new Date(a.ko) - new Date(b.ko));
  if (!rows.length) return null;
  const chip = (on, label, color = C.ok) => (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 8,
      color: on ? color : C.t3, background: on ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${on ? color : C.border}` }}>{label}</span>
  );
  const countdown = (ko) => {
    const mins = Math.round((new Date(ko) - Date.now()) / 60000);
    if (mins <= 0) return null;
    return mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
  return (
    <Section title="Tonight — every match, every stage">
      <div style={grid('280px')}>
        {rows.map(m => {
          const cd = countdown(m.ko);
          const done = ['FINISHED', 'FT'].includes(m.status);
          return (
            <Card key={m.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{m.home} v {m.away}</div>
                <div style={{ fontSize: 10, fontFamily: C.mono, color: m.stages.live ? C.bad : C.t3, whiteSpace: 'nowrap' }}>
                  {m.stages.live ? '● LIVE' : done ? `FT ${m.homeGoals ?? ''}–${m.awayGoals ?? ''}` : cd || new Date(m.ko).toUTCString().slice(17, 22) + ' UTC'}
                </div>
              </div>
              {m.probs && (
                <div style={{ fontSize: 11, fontFamily: C.mono, color: C.t2, marginTop: 5 }}>
                  {Math.round(m.probs.home)} / {Math.round(m.probs.draw)} / {Math.round(m.probs.away)}
                  {m.risk === 'HIGH' && <span style={{ color: C.warn, marginLeft: 8 }}>coin flip</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
                {chip(m.stages.priced, 'PRICED')}
                {chip(m.stages.callPosted, 'CALL POSTED', '#5BC0BE')}
                {chip(m.stages.live, 'LIVE', C.bad)}
                {chip(m.stages.graded, 'GRADED')}
                {chip(m.stages.receiptPosted, 'RECEIPT', '#5BC0BE')}
              </div>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

// ─── The buttons ─────────────────────────────────────────────────────
function Buttons() {
  const qc = useQueryClient();
  const cfg = useAdmin('/ops-config', 60000).data || {};
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [matchId, setMatchId] = useState('');

  const act = async (key, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: r?.data?.data?.message || 'Done — check the ops feed / Actions tab in ~1 min.' });
      qc.invalidateQueries({ queryKey: ['adm'] });
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.message || e.message });
    } finally { setBusy(''); }
  };
  const dispatch = (workflow, inputs) => adminApi.post('/dispatch-workflow', { workflow, inputs });

  const btn = (key, label, onClick, { danger = false, disabled = false, hint = '' } = {}) => (
    <button key={key} onClick={onClick} disabled={disabled || busy === key} title={hint}
      style={{ fontSize: 11.5, fontWeight: 600, padding: '8px 12px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? C.t3 : danger ? '#fff' : C.text,
        background: disabled ? 'rgba(255,255,255,0.03)' : danger ? C.accent : 'rgba(255,255,255,0.06)',
        border: `1px solid ${disabled ? C.border : danger ? C.accent : C.borderD}`, opacity: busy === key ? 0.6 : 1 }}>
      {busy === key ? 'Working…' : label}
    </button>
  );
  const needGh = !cfg.ghToken;
  const ghHint = needGh ? 'Add GITHUB_TOKEN to the Render env to enable workflow buttons' : '';

  return (
    <Section title="The buttons — push on the machine">
      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {btn('tick', '▶ Force matchday tick', () => act('tick', () => dispatch('social-matchday.yml', {})), { disabled: needGh, hint: ghHint })}
          {btn('ledger', 'Morning ledger now', () => act('ledger', () => dispatch('social-ledger.yml', {}), 'Post the morning ledger to all platforms NOW?'), { disabled: needGh, hint: ghHint })}
          {btn('picks', "Today's slate now", () => act('picks', () => dispatch('social-picks.yml', {}), "Post today's slate to all platforms NOW?"), { disabled: needGh, hint: ghHint })}
          {btn('rescore', 'Re-score results', () => act('rescore', () => adminApi.post('/rescore', { days: 2 })))}
          {btn('email-dry', 'Daily email (dry-run)', () => act('email-dry', () => adminApi.post('/send-daily-picks', { mode: 'dry-run' })))}
          {btn('email', 'Send daily email', () => act('email', () => adminApi.post('/send-daily-picks', { mode: 'send' }), 'Send the daily picks email to ALL active subscribers?'), { danger: true, disabled: !cfg.emailEnabled, hint: cfg.emailEnabled ? '' : 'RESEND_API_KEY not set' })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="match id (e.g. apf_1539000)"
            style={{ fontSize: 11.5, fontFamily: C.mono, padding: '7px 10px', borderRadius: 8, width: 200,
              background: C.base, border: `1px solid ${C.borderD}`, color: C.text, outline: 'none' }} />
          {btn('receipt', 'Re-issue match receipt', () => act('receipt', () => dispatch('social-ledger.yml', { match_id: matchId.trim() }), `Post the receipt for ${matchId.trim()} to all platforms?`), { disabled: needGh || !matchId.trim(), hint: ghHint })}
        </div>
        {needGh && (
          <div style={{ fontSize: 11, color: C.warn, marginTop: 10 }}>
            Workflow buttons are waiting on one thing only you can do: add a GitHub token
            (repo scope, Actions read/write) as <code style={{ fontFamily: C.mono }}>GITHUB_TOKEN</code> in Render → Environment. They light up automatically.
          </div>
        )}
        {msg && <div style={{ fontSize: 12, marginTop: 10, color: msg.ok ? C.ok : C.bad }}>{msg.text}</div>}
      </Card>
    </Section>
  );
}

// ─── Growth strip ────────────────────────────────────────────────────
function Growth() {
  const g = useAdmin('/growth', 60000).data;
  if (!g) return null;
  return (
    <Section title="The viral loop — slips leaving the building">
      <div style={grid('150px')}>
        <Metric label="Slip links minted" value={g.slips?.created ?? 0} />
        <Metric label="Shared slips opened" value={g.slips?.opens ?? 0} color={C.ok} />
        <Metric label="Bookmaker click-outs (7d)" value={g.funnel7d?.slip_bookie_opened ?? 0} color={C.accent} sub="the affiliate-pitch number"
          trend={{ curr: g.funnel7d?.slip_bookie_opened, prev: g.funnelPrev7d?.slip_bookie_opened, goodDirection: 'up', label: 'vs prev 7d' }} />
        <Metric label="Transfer sheet opens (7d)" value={g.funnel7d?.slip_transfer_opened ?? 0}
          trend={{ curr: g.funnel7d?.slip_transfer_opened, prev: g.funnelPrev7d?.slip_transfer_opened, goodDirection: 'up', label: 'vs prev 7d' }} />
        <Metric label="Active subscribers" value={g.subscribers?.active ?? 0} sub={`+${g.subscribers?.last7d ?? 0} this week`} color={C.warn}
          trend={{ curr: g.subscribers?.last7d, prev: g.subscribers?.prev7d, goodDirection: 'up', label: 'signups vs last wk' }} />
      </div>
      {(g.slips?.top || []).filter(t => t.hits > 0).length > 0 && (
        <Card style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Most-opened slips</div>
          {g.slips.top.filter(t => t.hits > 0).map(t => (
            <div key={t.code} style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: C.mono, color: C.t2, padding: '3px 0' }}>
              <span style={{ color: C.accent, fontWeight: 700 }}>{t.code}</span>
              <span>{t.hits} opens</span>
              {t.combined_odds && <span style={{ color: C.t3 }}>@ {Number(t.combined_odds).toFixed(2)}×</span>}
            </div>
          ))}
        </Card>
      )}
    </Section>
  );
}

// ─── Ops feed ────────────────────────────────────────────────────────
function Feed() {
  const [hours, setHours] = useState(48);
  const events = useAdmin(`/ops-feed?hours=${hours}`, 30000).data || [];
  return (
    <Section title="Ops feed — everything the machine did">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[24, 48, 168].map(h => (
          <button key={h} onClick={() => setHours(h)}
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
              color: hours === h ? '#fff' : C.t2, background: hours === h ? C.accent : 'transparent', border: `1px solid ${hours === h ? C.accent : C.border}` }}>
            {h === 168 ? '7d' : `${h}h`}
          </button>
        ))}
      </div>
      <Card>
        {!events.length && <div style={{ fontSize: 12, color: C.t3, padding: '14px 0', textAlign: 'center' }}>Quiet. The machine is between jobs.</div>}
        {events.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: i < events.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
              background: e.type === 'grade' ? (e.hit ? C.ok : C.bad) : (TYPE_COLOR[e.type] || C.t3) }} />
            <span style={{ flex: 1, fontSize: 12.5, color: C.text, minWidth: 0 }}>{e.label}</span>
            <span style={{ fontSize: 10.5, fontFamily: C.mono, color: C.t3, whiteSpace: 'nowrap' }}>{timeAgo(e.at)}</span>
          </div>
        ))}
      </Card>
    </Section>
  );
}

export default function Ops() {
  return (
    <>
      <Tonight />
      <Buttons />
      <Growth />
      <Feed />
    </>
  );
}
