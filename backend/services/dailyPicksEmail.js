// ─── DAILY PICKS EMAIL ──────────────────────────────────────────────
// The promise the welcome email makes ("best bets every morning of the
// World Cup") — kept. Once a day at 07:00 UTC every active subscriber
// gets: yesterday's settled receipts, the running ledger, and the next
// 24 hours of locked-path calls. Until they unsubscribe.
//
// Idempotency: one email_log row per (kind, send_date) — the UNIQUE
// constraint makes a double-send impossible even if two instances race
// during a deploy. A boot catch-up covers the dyno being asleep at 07:00.
//
// Numbers come from the SAME shared path the site shows (locked row if
// the lock job has run, else the shared compute) — the email must never
// say something the site doesn't.

import api from './apisports.js';
import {
  getWcDisplayPrediction, getSharedOddsEvents, getLockedWcPredictionsMap,
} from './wcDisplayPrediction.js';
import { sendEmail, emailEnabled } from './email.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

const SITE = 'https://oddyessa.com';
const PUBLIC_API = (process.env.PUBLIC_API_URL || 'https://troys-footy-iq-api.onrender.com').replace(/\/+$/, '');
const MAX_MATCHES = 10;

// ─── Data ───────────────────────────────────────────────────────────

async function getTodaysSlate() {
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;
  const all = await api.getLeagueSeasonFixtures('WC', 2026).catch(() => []);
  const upcoming = (all || [])
    .filter(f => {
      const t = new Date(f.date).getTime();
      return Number.isFinite(t) && t >= now && t <= horizon
        && !['FINISHED', 'LIVE', 'IN_PLAY'].includes(f.status);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, MAX_MATCHES);
  if (!upcoming.length) return [];

  const [odds, lockedMap] = await Promise.all([
    getSharedOddsEvents(),
    getLockedWcPredictionsMap(upcoming.map(f => String(f.id))),
  ]);
  const rows = [];
  for (const f of upcoming) {
    const pred = lockedMap.get(String(f.id))
      || await getWcDisplayPrediction(f, { oddsEvents: odds, skipLocked: true });
    if (!pred?.probabilities) continue;
    const { home, draw, away } = pred.probabilities;
    const lean = home >= draw && home >= away
      ? { team: f.homeTeam?.name, prob: home, edge: pred.valueEdges?.home }
      : away >= draw
        ? { team: f.awayTeam?.name, prob: away, edge: pred.valueEdges?.away }
        : { team: 'Draw', prob: draw, edge: pred.valueEdges?.draw };
    rows.push({
      id: String(f.id),
      home: f.homeTeam?.name, away: f.awayTeam?.name,
      kickoff: new Date(f.date),
      probs: { home, draw, away },
      lean,
      risk: pred.riskLevel || 'MEDIUM',
      scoreline: pred.topScorelines?.[0] || null,
    });
  }
  return rows;
}

async function getYesterdaysReceipts() {
  if (!isDbAvailable()) return [];
  // 26h window at 07:00 UTC covers every kickoff since 05:00 the previous
  // day — i.e. the whole previous matchday including the overnight games.
  const r = await safeQuery(`
    SELECT home_team, away_team, predicted_outcome, prediction_correct,
           brier_score, prob_home, prob_draw, prob_away,
           COALESCE(ft_home_goals, home_goals) AS hg,
           COALESCE(ft_away_goals, away_goals) AS ag,
           match_date
    FROM model_performance
    WHERE match_date >= NOW() - INTERVAL '26 hours'
    ORDER BY match_date ASC`);
  return r?.rows || [];
}

async function getLedger() {
  if (!isDbAvailable()) return null;
  const r = await safeQuery(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE prediction_correct)::int AS correct,
           ROUND(AVG(brier_score)::numeric, 3) AS avg_brier
    FROM model_performance`);
  const row = r?.rows?.[0];
  return row && row.total > 0 ? row : null;
}

// ─── Rendering ──────────────────────────────────────────────────────

const fmtPct = (v) => `${Math.round(Number(v))}%`;
const fmtTime = (d) => d.toISOString().slice(11, 16) + ' UTC';
const fmtDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const RISK_LABEL = { LOW: 'clear favourite', MEDIUM: 'lean', HIGH: 'coin flip' };
const RISK_COLOR = { LOW: '#22C55E', MEDIUM: '#EAB308', HIGH: '#EAB308' };

function probLean(rec) {
  const p = { HOME: rec.prob_home, DRAW: rec.prob_draw, AWAY: rec.prob_away }[rec.predicted_outcome];
  const name = { HOME: rec.home_team, DRAW: 'Draw', AWAY: rec.away_team }[rec.predicted_outcome];
  return `${esc(name)} @ ${fmtPct(p)}`;
}

export function buildDailyPicksEmail({ slate, receipts, ledger, date = new Date() }) {
  const nToday = slate.length;
  const yesterdayLine = receipts.length
    ? `${receipts.filter(x => x.prediction_correct).length}/${receipts.length} yesterday`
    : null;

  const subject = nToday
    ? `Today's calls — ${nToday} ${nToday === 1 ? 'match' : 'matches'}${yesterdayLine ? ` · we went ${yesterdayLine}` : ''}`
    : `The ledger — ${yesterdayLine ? `we went ${yesterdayLine}` : 'rest day'}`;

  const receiptRows = receipts.map(rcp => `
    <div style="display:block;background:#14161B;border:1px solid #26282e;border-radius:10px;padding:12px 14px;margin:8px 0">
      <span style="color:${rcp.prediction_correct ? '#22C55E' : '#EF4444'};font-weight:700">${rcp.prediction_correct ? '✓' : '✗'}</span>
      <span style="color:#fff;font-weight:600">&nbsp;${esc(rcp.home_team)} ${rcp.hg}–${rcp.ag} ${esc(rcp.away_team)}</span>
      <div style="color:#9aa0aa;font-size:13px;margin-top:4px">called ${probLean(rcp)} · Brier <span style="font-family:Menlo,Consolas,monospace">${Number(rcp.brier_score).toFixed(3)}</span></div>
    </div>`).join('');

  const slateRows = slate.map(m => {
    const edge = m.lean.edge != null && Number(m.lean.edge) >= 5
      ? `<span style="color:#22C55E;font-size:12px;font-weight:700">&nbsp;+${Math.round(m.lean.edge)} pts vs market</span>` : '';
    const score = m.scoreline ? ` · most likely ${esc(m.scoreline.score)} (${fmtPct(m.scoreline.probability)})` : '';
    return `
    <div style="background:#14161B;border:1px solid #26282e;border-radius:10px;padding:14px;margin:8px 0">
      <div style="color:#9aa0aa;font-size:12px;letter-spacing:.08em">${fmtTime(m.kickoff)}</div>
      <div style="color:#fff;font-size:16px;font-weight:700;margin:4px 0">${esc(m.home)} v ${esc(m.away)}</div>
      <div style="font-size:14px;color:#c7c7cf">
        <span style="color:#A8344A;font-weight:700">${esc(m.lean.team)} @ ${fmtPct(m.lean.prob)}</span>
        <span style="color:${RISK_COLOR[m.risk] || '#9aa0aa'};font-size:12px">&nbsp;· ${RISK_LABEL[m.risk] || m.risk.toLowerCase()}</span>${edge}
      </div>
      <div style="color:#6b6b73;font-size:12px;margin-top:4px">${fmtPct(m.probs.home)} / ${fmtPct(m.probs.draw)} / ${fmtPct(m.probs.away)}${score}</div>
    </div>`;
  }).join('');

  const ledgerLine = ledger
    ? `<p style="color:#9aa0aa;font-size:13px;margin:14px 0 0">Running ledger: <b style="color:#fff">${ledger.correct}/${ledger.total}</b> winners · avg Brier <b style="color:#fff;font-family:Menlo,Consolas,monospace">${ledger.avg_brier}</b> <span style="color:#6b6b73">(0 = perfect, 0.222 = coin flip${ledger.total < 20 ? ` · early days, n=${ledger.total}` : ''})</span></p>`
    : '';

  const html = `<div style="background:#0B0B0D;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:28px 20px;max-width:560px;margin:0 auto;border-radius:16px">
  <div style="font-size:20px;font-weight:800"><span style="color:#A8344A">Odd</span>yessa</div>
  <p style="color:#6b6b73;font-size:12px;letter-spacing:.14em;margin:6px 0 0">${fmtDay(date).toUpperCase()} · WORLD CUP 2026</p>

  ${receipts.length ? `<h2 style="font-size:15px;margin:22px 0 4px;color:#9aa0aa;letter-spacing:.08em">YESTERDAY — SETTLED</h2>${receiptRows}${ledgerLine}` : ''}

  ${nToday ? `<h2 style="font-size:15px;margin:26px 0 4px;color:#9aa0aa;letter-spacing:.08em">NEXT 24 HOURS — OUR CALLS</h2>${slateRows}
  <p style="color:#6b6b73;font-size:12px;margin-top:6px">Numbers may sharpen until each call locks 75 minutes before kickoff — the locked number is what we score ourselves on.</p>` : `<p style="color:#c7c7cf;font-size:14px;margin-top:22px">No matches in the next 24 hours. The ledger rests; so should you.</p>`}

  <a href="${SITE}" style="display:inline-block;margin-top:18px;background:#A8344A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:12px;font-weight:700;font-size:14px">Full reasoning on every call →</a>

  <p style="color:#6b6b73;font-size:11px;margin-top:26px;line-height:1.6;border-top:1px solid #26282e;padding-top:14px">
    Probabilities, not promises — information, not betting advice. 18+ · <a href="https://www.begambleaware.org" style="color:#9a9aa2">BeGambleAware.org</a>.<br>
    Every prediction is locked before kickoff and scored in public — including the misses.<br>
    <a href="__UNSUB__" style="color:#9a9aa2">Unsubscribe</a> any time.
  </p>
</div>`;

  const text = [
    `Oddyessa — ${fmtDay(date)} · World Cup 2026`,
    '',
    ...(receipts.length ? [
      'YESTERDAY — SETTLED',
      ...receipts.map(rcp => `${rcp.prediction_correct ? '[HIT] ' : '[MISS]'} ${rcp.home_team} ${rcp.hg}-${rcp.ag} ${rcp.away_team} — called ${probLean(rcp).replace(/&[a-z]+;/g, '')} (Brier ${Number(rcp.brier_score).toFixed(3)})`),
      ledger ? `Running ledger: ${ledger.correct}/${ledger.total} winners, avg Brier ${ledger.avg_brier}` : '',
      '',
    ] : []),
    ...(nToday ? [
      'NEXT 24 HOURS — OUR CALLS',
      ...slate.map(m => `${fmtTime(m.kickoff)}  ${m.home} v ${m.away} — ${m.lean.team} @ ${fmtPct(m.lean.prob)} (${RISK_LABEL[m.risk] || m.risk})`),
    ] : ['No matches in the next 24 hours.']),
    '',
    `Full reasoning: ${SITE}`,
    'Information, not betting advice. 18+. Unsubscribe: __UNSUB__',
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

// ─── Sending ────────────────────────────────────────────────────────

async function alreadySentToday() {
  const r = await safeQuery(
    `SELECT 1 FROM email_log WHERE kind='daily_picks' AND send_date = (NOW() AT TIME ZONE 'utc')::date`);
  return !!r?.rows?.length;
}

/**
 * Build + send the daily picks email to every active subscriber.
 * @param {object} opts
 * @param {boolean} opts.dryRun  build only — returns content, sends nothing
 * @param {boolean} opts.force   ignore the once-per-day guard
 */
export async function sendDailyPicks({ dryRun = false, force = false } = {}) {
  if (!isDbAvailable()) return { skipped: 'no_db' };
  if (!dryRun && !force && await alreadySentToday()) return { skipped: 'already_sent_today' };

  const [slate, receipts, ledger] = await Promise.all([
    getTodaysSlate(), getYesterdaysReceipts(), getLedger(),
  ]);
  if (!slate.length && !receipts.length) return { skipped: 'nothing_to_say' };

  const { subject, html, text } = buildDailyPicksEmail({ slate, receipts, ledger });

  const subs = await safeQuery(
    `SELECT email, unsubscribe_token FROM subscribers WHERE status='active' ORDER BY id`);
  const recipients = subs?.rows || [];

  if (dryRun) {
    return {
      dryRun: true, subject, html, text,
      recipients: recipients.length, today: slate.length, yesterday: receipts.length,
    };
  }
  if (!emailEnabled()) return { skipped: 'email_disabled', recipients: recipients.length };
  if (!recipients.length) return { skipped: 'no_subscribers' };

  let sent = 0, failed = 0;
  for (const sub of recipients) {
    const unsub = `${PUBLIC_API}/api/subscribe/unsubscribe?token=${sub.unsubscribe_token}`;
    const r = await sendEmail({
      to: sub.email,
      subject,
      html: html.replaceAll('__UNSUB__', unsub),
      text: text.replaceAll('__UNSUB__', unsub),
      headers: { 'List-Unsubscribe': `<${unsub}>` },
    });
    r?.error ? failed++ : sent++;
    await new Promise(res => setTimeout(res, 150)); // stay friendly to Resend rate limits
  }

  await safeQuery(
    `INSERT INTO email_log (kind, send_date, recipients, meta)
     VALUES ('daily_picks', (NOW() AT TIME ZONE 'utc')::date, $1, $2)
     ON CONFLICT (kind, send_date) DO UPDATE SET recipients = email_log.recipients + EXCLUDED.recipients`,
    [sent, JSON.stringify({ subject, today: slate.length, yesterday: receipts.length, failed })]);

  console.log(`[dailyPicks] sent ${sent}/${recipients.length} (${failed} failed) — "${subject}"`);
  return { sent, failed, recipients: recipients.length, subject };
}

/**
 * Boot catch-up: if the dyno was asleep at 07:00 UTC, send late — but only
 * in the morning window (07:00–12:00 UTC) so a midnight deploy doesn't
 * fire yesterday-flavoured content at night. The email_log guard still
 * prevents doubles.
 */
export async function catchUpDailyPicks() {
  const h = new Date().getUTCHours();
  if (h < 7 || h >= 12) return { skipped: 'outside_window' };
  return sendDailyPicks();
}

export default { sendDailyPicks, catchUpDailyPicks, buildDailyPicksEmail };
