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
import { getRecentResults } from './resultService.js';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { getNationColor, emailFlagBleed } from '../constants/nationColors.js';

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
  // model_performance has no team/date columns of its own — reuse the
  // proven predictions+fixtures join behind /api/results/recent. The 26h
  // window at 07:00 UTC covers every kickoff since 05:00 the previous
  // day — i.e. the whole previous matchday including the overnight games.
  const rows = await getRecentResults(20).catch(() => []);
  const cutoff = Date.now() - 26 * 3600 * 1000;
  const recent = rows
    .filter(r => r.match_date && new Date(r.match_date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
    .map(r => ({ ...r, hg: r.ft_home_goals ?? r.home_goals, ag: r.ft_away_goals ?? r.away_goals }));

  // "We even called the exact score" — true when the locked call's #1
  // scoreline matches the 90-minute result (same rule as the site verdict).
  const lockedMap = await getLockedWcPredictionsMap(recent.map(r => String(r.match_external_id))).catch(() => new Map());
  for (const r of recent) {
    const top = lockedMap.get(String(r.match_external_id))?.topScorelines?.[0];
    r.scoreline_exact = !!top && top.score === `${r.hg}-${r.ag}`;
  }
  return recent;
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

// ─── Rendering (v2) ─────────────────────────────────────────────────
// Design rules: plain words a casual fan understands (no jargon in the
// body — the accuracy score lives in the small print); every match tile
// carries the app's signature flag-colour bleed; the header is the
// animated orbit-mark GIF (served from the site, ~79KB, loops). All
// numbers in monospace. Gradients are progressive enhancement —
// background-color paints first so stripped clients still read fine.

const fmtPct = (v) => `${Math.round(Number(v))}%`;
const fmtTime = (d) => d.toISOString().slice(11, 16) + ' UTC';
const fmtDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HEADER_GIF = `${SITE}/email-header.gif`;
const MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";

// Plain-words confidence — no model-speak.
const RISK_PLAIN = {
  LOW: 'we’re confident',
  MEDIUM: 'we lean this way',
  HIGH: 'coin flip — could go anywhere',
};
const RISK_COLOR = { LOW: '#22C55E', MEDIUM: '#EAB308', HIGH: '#EAB308' };

function leanOf(rec) {
  const p = { HOME: rec.prob_home, DRAW: rec.prob_draw, AWAY: rec.prob_away }[rec.predicted_outcome];
  const name = { HOME: rec.home_team, DRAW: 'a draw', AWAY: rec.away_team }[rec.predicted_outcome];
  return { name, p };
}

// Three-segment probability bar as a table — tables render everywhere,
// including Outlook. Home side in the home nation's colour, away in the
// away's, the draw stays neutral slate.
function probBar(m) {
  const h = Math.max(4, Math.round(m.probs.home));
  const a = Math.max(4, Math.round(m.probs.away));
  const d = Math.max(4, 100 - h - a);
  const hc = getNationColor(m.home), ac = getNationColor(m.away);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:2px 0;margin:10px 0 4px">
    <tr style="line-height:7px;font-size:1px">
      <td width="${h}%" bgcolor="${hc}" style="height:7px;border-radius:4px 0 0 4px"></td>
      <td width="${d}%" bgcolor="#2A2D35" style="height:7px"></td>
      <td width="${a}%" bgcolor="${ac}" style="height:7px;border-radius:0 4px 4px 0"></td>
    </tr>
  </table>
  <div style="font-family:${MONO};font-size:11px;color:#7c828d">
    ${esc(m.home)} ${fmtPct(m.probs.home)} &nbsp;·&nbsp; draw ${fmtPct(m.probs.draw)} &nbsp;·&nbsp; ${esc(m.away)} ${fmtPct(m.probs.away)}
  </div>`;
}

export function buildDailyPicksEmail({ slate, receipts, ledger, date = new Date() }) {
  const nToday = slate.length;
  const nRight = receipts.filter(x => x.prediction_correct).length;
  const allRight = receipts.length > 0 && nRight === receipts.length;

  const subject = receipts.length && nToday
    ? `We got ${nRight} of ${receipts.length} right — today’s picks inside ⚽`
    : nToday
      ? `Today’s World Cup picks — ${nToday} ${nToday === 1 ? 'game' : 'games'} ⚽`
      : receipts.length
        ? `How we did yesterday — ${nRight} of ${receipts.length} right`
        : 'The World Cup rests today — so do we';

  // ── Yesterday: settled tiles ──
  const receiptTiles = receipts.map(rcp => {
    const hit = !!rcp.prediction_correct;
    const lean = leanOf(rcp);
    const exact = rcp.scoreline_exact; // optional flag if provided upstream
    return `
    <div style="background-color:#14161B;background-image:${emailFlagBleed(rcp.home_team, rcp.away_team)};border:1px solid #26282e;border-radius:14px;padding:16px 18px;margin:10px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="color:#ffffff;font-size:17px;font-weight:700">
          ${esc(rcp.home_team)} <span style="font-family:${MONO}">${rcp.hg}–${rcp.ag}</span> ${esc(rcp.away_team)}
        </td>
        <td align="right" style="font-size:15px;font-weight:800;color:${hit ? '#22C55E' : '#EF4444'};white-space:nowrap">
          ${hit ? '✓ RIGHT' : '✗ WRONG'}
        </td>
      </tr></table>
      <div style="color:#aeb3bc;font-size:13.5px;margin-top:6px;line-height:1.5">
        We said <b style="color:#fff">${esc(lean.name)}</b> (${fmtPct(lean.p)} sure) — ${hit ? 'and that’s how it went.' : 'we were wrong. It stays on the record.'}
        ${exact ? `<br><span style="color:#EAB308">We even called the exact score.</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const tallyLine = ledger
    ? `<p style="color:#8a909b;font-size:13px;margin:12px 2px 0;line-height:1.5">
         This World Cup so far: <b style="color:#fff">${ledger.correct} of ${ledger.total}</b> winners called.
       </p>`
    : '';

  // ── Today: pick tiles ──
  const pickTiles = slate.map(m => {
    const edge = m.lean.edge != null && Number(m.lean.edge) >= 5;
    return `
    <div style="background-color:#14161B;background-image:${emailFlagBleed(m.home, m.away)};border:1px solid #26282e;border-radius:14px;padding:16px 18px;margin:10px 0">
      <div style="font-family:${MONO};font-size:11.5px;letter-spacing:.08em;color:#8a909b">${fmtTime(m.kickoff)}</div>
      <div style="color:#ffffff;font-size:17px;font-weight:700;margin:5px 0 2px">${esc(m.home)} v ${esc(m.away)}</div>
      <div style="font-size:14.5px;color:#d6d9de;margin-top:4px">
        Our pick: <b style="color:#fff">${esc(m.lean.team)}</b>
        <span style="color:${RISK_COLOR[m.risk] || '#8a909b'};font-size:12.5px"> · ${RISK_PLAIN[m.risk] || ''}</span>
      </div>
      ${probBar(m)}
      ${m.scoreline ? `<div style="color:#8a909b;font-size:12.5px;margin-top:8px">Most likely score: <span style="font-family:${MONO};color:#d6d9de">${esc(m.scoreline.score)}</span></div>` : ''}
      ${edge ? `<div style="display:inline-block;margin-top:9px;padding:4px 10px;border:1px solid rgba(34,197,94,.45);border-radius:99px;color:#22C55E;font-size:12px;font-weight:700">The bookies are underrating ${esc(m.lean.team)} — worth a look</div>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0B0B0D">
<div style="display:none;max-height:0;overflow:hidden">${receipts.length ? `Yesterday: ${nRight} of ${receipts.length} right.` : ''} ${nToday ? `Today: ${nToday} ${nToday === 1 ? 'game' : 'games'}, picks inside.` : ''}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<div style="max-width:600px;margin:0 auto;padding:0 0 28px;background-color:#0B0B0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

  <a href="${SITE}" style="text-decoration:none">
    <img src="${HEADER_GIF}" width="600" alt="Oddyessa — your morning calls" style="display:block;width:100%;max-width:600px;height:auto;border:0"/>
  </a>

  <div style="padding:6px 22px 0">
    <div style="font-family:${MONO};font-size:11.5px;letter-spacing:.22em;color:#6d737e;text-align:center;margin:2px 0 18px">
      ${fmtDay(date).toUpperCase()} · WORLD CUP 2026
    </div>

    ${receipts.length ? `
    <h2 style="color:#ffffff;font-size:20px;margin:14px 0 2px;letter-spacing:-.01em">
      Yesterday: we got ${allRight ? (receipts.length === 1 ? 'it' : 'both') : `${nRight} of ${receipts.length}`} right${allRight ? '.' : '.'}
    </h2>
    <p style="color:#8a909b;font-size:13px;margin:4px 0 6px">Every pick below was published before kickoff — then checked against the result.</p>
    ${receiptTiles}
    ${tallyLine}` : ''}

    ${nToday ? `
    <h2 style="color:#ffffff;font-size:20px;margin:${receipts.length ? '30px' : '14px'} 0 2px;letter-spacing:-.01em">Today’s games — who we’ve got</h2>
    <p style="color:#8a909b;font-size:13px;margin:4px 0 6px">Our numbers can shift a little until each game locks before kickoff.</p>
    ${pickTiles}` : `
    <p style="color:#d6d9de;font-size:15px;margin:18px 0">No games in the next 24 hours. Back tomorrow.</p>`}

    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 0"><tr>
      <td bgcolor="#A8344A" style="border-radius:12px">
        <a href="${SITE}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">See the full reasoning →</a>
      </td>
    </tr></table>

    <p style="color:#5d626c;font-size:11px;margin-top:30px;line-height:1.7;border-top:1px solid #26282e;padding-top:16px">
      ${ledger ? `Our accuracy score so far: <span style="font-family:${MONO}">${ledger.avg_brier}</span> — 0 is perfect, 0.222 is guessing. We publish it even when it looks bad.<br>` : ''}
      This is information, not betting advice. 18+ · <a href="https://www.begambleaware.org" style="color:#8a909b">BeGambleAware.org</a><br>
      You signed up at oddyessa.com · <a href="__UNSUB__" style="color:#8a909b">Unsubscribe</a> any time.
    </p>
  </div>
</div>
</body></html>`;

  const text = [
    `Oddyessa — ${fmtDay(date)} · World Cup 2026`,
    '',
    ...(receipts.length ? [
      `YESTERDAY: WE GOT ${nRight} OF ${receipts.length} RIGHT`,
      ...receipts.map(rcp => {
        const lean = leanOf(rcp);
        return `${rcp.prediction_correct ? '[RIGHT]' : '[WRONG]'} ${rcp.home_team} ${rcp.hg}-${rcp.ag} ${rcp.away_team} — we said ${lean.name} (${fmtPct(lean.p)} sure)`;
      }),
      ledger ? `This World Cup so far: ${ledger.correct} of ${ledger.total} winners called.` : '',
      '',
    ] : []),
    ...(nToday ? [
      'TODAY — WHO WE’VE GOT',
      ...slate.map(m => `${fmtTime(m.kickoff)}  ${m.home} v ${m.away} — our pick: ${m.lean.team} (${fmtPct(m.lean.prob)} sure${RISK_PLAIN[m.risk] ? `, ${RISK_PLAIN[m.risk]}` : ''})`),
    ] : ['No games in the next 24 hours. Back tomorrow.']),
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

/** Ops view: did today's (and recent) sends happen, and is sending possible? */
export async function dailyPicksStatus() {
  const log = await safeQuery(
    `SELECT kind, send_date, recipients, meta, created_at
     FROM email_log ORDER BY send_date DESC LIMIT 7`);
  const subs = await safeQuery(
    `SELECT status, COUNT(*)::int AS n FROM subscribers GROUP BY status`);
  return {
    emailEnabled: emailEnabled(),
    log: log?.rows || [],
    subscribers: Object.fromEntries((subs?.rows || []).map(r => [r.status, r.n])),
  };
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

export default { sendDailyPicks, catchUpDailyPicks, buildDailyPicksEmail, dailyPicksStatus };
