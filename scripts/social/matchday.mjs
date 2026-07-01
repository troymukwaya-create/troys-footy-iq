// ─── MATCHDAY ORCHESTRATOR ──────────────────────────────────────────
// Runs every ~30 min (social-matchday.yml). Decides what is due and
// generates it via generate.mjs; the workflow hosts + publishes.
//
//   1. ENGINE CHECK   — /health must be green before we post anything.
//   2. PRE-MATCH      — every WC game gets its call card ~2h before
//                       kickoff (capture band 105–135 min pre-KO).
//   3. POST-MATCH     — every scored game gets its verdict card ~1h
//                       after the final whistle (held to KO + ~2h55m).
//   4. SCORING ALARM  — a finished game still ungraded ~5.5h after
//                       kickoff turns the run red (Troy gets the email).
//
// State (which posts already went out) lives on the social-assets
// branch as state/posted.json; the workflow passes it in via STATE_PATH
// and commits out/state-next.json back. First run with no state seeds a
// baseline and posts nothing.
//
//   node matchday.mjs            → decide + generate due cards
//
// One pre-match + one receipt max per tick: the 30-min cadence drains
// any queue fast, and it keeps the channels from bursting.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const API = process.env.ODDYESSA_API || 'https://troys-footy-iq-api.onrender.com/api';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
mkdirSync(OUT, { recursive: true });

const STATE_PATH = process.env.STATE_PATH || path.join(DIR, 'state.json');
// Pre-match "The Call" posts at the first tick a game is <= PRE_MAX out (so it
// posts AT the 2h mark, never earlier), with PRE_MIN as a floor so a missed
// tick still gets a card out (down to 45 min pre-KO) rather than skipping the
// game entirely. Exact 2h timing needs the 5-min heartbeat armed (GITHUB_TOKEN
// in Render); on GitHub's throttled ~2h cron the wide floor is the safety net.
const PRE_MIN = 45, PRE_MAX = 120;           // pre-match capture band: post ~2h before KO (Troy's spec)
const RECEIPT_AFTER_KO_MIN = 175;            // hold the verdict until ~1h after full time (KO + ~2h55m)
const SCORING_GRACE_MIN = 330;               // KO + 5.5h without a grade = alarm

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'oddyessa-matchday/1' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

// ── 1. engine check ──────────────────────────────────────────────────
const health = await getJson(API.replace(/\/api$/, '') + '/health');
if (health?.status !== 'ok' || !health?.env?.dbConnected) {
  console.error('ENGINE CHECK FAILED:', JSON.stringify(health?.env || health).slice(0, 300));
  process.exit(1);
}
console.log('engine check: green (db connected, status ok)');

// ── data ─────────────────────────────────────────────────────────────
const [upcoming, recent, allFx] = await Promise.all([
  getJson(`${API}/fixtures/upcoming`),
  getJson(`${API}/results/recent`),
  getJson(`${API}/fixtures/all`).catch(() => ({ fixtures: [] })),
]);
const now = Date.now();
const wcUpcoming = (upcoming.fixtures || []).filter(f => f.league?.code === 'WC' && f.date);
let settled = (recent.data || []).filter(r => r.match_external_id);

// ── 1b. force a grade NOW (kills the ~2h wait) ───────────────────────
// The receipt can only post once a match is GRADED into the ledger. The
// backend's own ingest cron runs every ~30 min, so a game that ends right
// after a run waits up to half an hour just to be scored. When a WC game
// looks finished (FT, or KO > 105 min ago) but isn't on the ledger yet,
// trigger result ingestion synchronously, then re-read — so this same tick
// can post its receipt within minutes of the final whistle, not hours.
const settledIds0 = new Set(settled.map(s => s.match_external_id));
const minsSince = (d) => (now - new Date(d).getTime()) / 60000;
const needsGrade = (allFx.fixtures || []).some(f =>
  f.league?.code === 'WC' && f.date
  && (['FINISHED', 'FT'].includes(f.status) || minsSince(f.date) > 105)
  && minsSince(f.date) < 48 * 60
  && !settledIds0.has(f.id));
if (needsGrade) {
  try {
    const r = await fetch(`${API}/results/update?days=1`, { method: 'POST', headers: { 'User-Agent': 'oddyessa-matchday/1' } });
    console.log(`force-grade: ${r.status} (a finished WC game was not on the ledger yet)`);
    if (r.ok) { const re = await getJson(`${API}/results/recent`); settled = (re.data || []).filter(x => x.match_external_id); }
  } catch (e) { console.log('force-grade skipped:', e.message); }
} else {
  console.log('force-grade: not needed (nothing finished-but-ungraded)');
}

// ── state ────────────────────────────────────────────────────────────
let state = null;
try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* first run */ }

if (!state || !Array.isArray(state.prematch) || !Array.isArray(state.receipts)) {
  // Baseline: mark history as handled so the first live tick only acts
  // on NEW events. Games already inside (or past) the pre-match band are
  // NOT seeded — they are still owed their call card.
  state = {
    prematch: wcUpcoming
      .filter(f => (new Date(f.date) - now) / 60000 < PRE_MIN)
      .map(f => f.id),
    receipts: settled.map(s => s.match_external_id),
    pending: {},
    seededAt: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT, 'state-next.json'), JSON.stringify(state, null, 2));
  console.log(`baseline seeded: ${state.receipts.length} receipts + ${state.prematch.length} prematch marked as already handled — no posts this tick`);
  process.exit(0);
}

// Resilient: a generate crash must NOT take down the rest of the tick (the
// state write + the SCORING OVERDUE alarm — the only email safety net). Log
// it, flag it, keep going; the owed item is left untouched for next tick's
// retry, and the run still exits non-zero at the very end so the failure is
// surfaced (workflow goes red → email).
let genFailed = false;
const gen = (args) => {
  try {
    execFileSync('node', [path.join(DIR, 'generate.mjs'), ...args], { stdio: 'inherit', cwd: DIR });
    return true;
  } catch (e) {
    console.error(`generate ${args.join(' ')} FAILED: ${e.message}`);
    genFailed = true;
    return false;
  }
};
const actions = [];
// Append-only post log — the CEO dashboard's ops feed reads this off the
// social-assets branch. publish.mjs appends to it when an item finishes on
// every platform; we only ensure it exists here.
state.log = Array.isArray(state.log) ? state.log.slice(-199) : [];

// ── per-platform delivery state ──────────────────────────────────────
// An item is only "done" (in state.prematch / state.receipts) once it has
// landed on every configured platform. Until then it lives in state.pending
// with a per-platform status, and we re-generate + re-post ONLY the owed
// platforms each tick — so a Telegram-ok / Instagram-failed receipt retries
// Instagram next tick without double-posting Telegram. publish.mjs records
// the results and promotes items from pending → done.
state.pending = state.pending || {};
const ALL_PLATFORMS = ['telegram', 'x', 'instagram'];
const owedOf = (id) => {
  const p = state.pending[id]?.platforms;
  if (!p) return ALL_PLATFORMS.slice();
  return ALL_PLATFORMS.filter(k => p[k] === 'todo' || p[k] === 'failed');
};
const ensurePending = (id, kind, label) => {
  if (!state.pending[id]) {
    state.pending[id] = { kind, label, platforms: Object.fromEntries(ALL_PLATFORMS.map(k => [k, 'todo'])) };
  } else if (label && !state.pending[id].label) {
    state.pending[id].label = label;
  }
};
// Stamp the generated payload so publish.mjs knows the item id + which
// platforms to (re)post this tick.
const stampPayload = (file, id, only) => {
  const fp = path.join(OUT, file);
  const p = JSON.parse(readFileSync(fp, 'utf8'));
  p._id = id; p._only = only;
  writeFileSync(fp, JSON.stringify(p, null, 2));
};

// ── 2. pre-match due? ────────────────────────────────────────────────
// Due = in the capture band and not yet fully delivered. Items still owed a
// platform (in state.pending, not in state.prematch) are picked up here too.
const duePre = wcUpcoming
  .filter(f => {
    const mins = (new Date(f.date) - now) / 60000;
    return mins >= PRE_MIN && mins <= PRE_MAX && !state.prematch.includes(f.id);
  })
  .sort((a, b) => new Date(a.date) - new Date(b.date));
if (duePre.length) {
  const f = duePre[0];
  const owed = owedOf(f.id);
  console.log(`pre-match due: ${f.homeTeam?.name} v ${f.awayTeam?.name} (${f.id}) → owed: ${owed.join(', ')}`);
  if (gen(['prematch', f.id])) {
    const payload = JSON.parse(readFileSync(path.join(OUT, 'prematch.json'), 'utf8'));
    if (!payload.skip) {
      ensurePending(f.id, 'prematch', `${f.homeTeam?.name} v ${f.awayTeam?.name}`);
      stampPayload('prematch.json', f.id, owedOf(f.id));
      actions.push('prematch');
    }
  }
  if (duePre.length > 1) console.log(`${duePre.length - 1} more pre-match due — next tick takes the next one`);
}

// ── 3. verdict due? ──────────────────────────────────────────────────
// The verdict card posts ~1h after the final whistle (RECEIPT_AFTER_KO_MIN
// gate below), so by the time an item is due the game is long graded and the
// scoreline/market verdict + story are ready. verdictWait stays as a tiny
// safety hold for the rare case a grade lags the gate.
state.verdictWait = state.verdictWait || {};
const MAX_VERDICT_HOLDS = 1;
const dueReceipt = settled
  .filter(s => !state.receipts.includes(s.match_external_id)
    && new Date(s.match_date).getTime() > now - 48 * 3600 * 1000
    // Troy's spec: post the verdict ~1h after the final whistle, not ASAP.
    // FT ≈ KO + ~1h55m, so hold until KO + RECEIPT_AFTER_KO_MIN (~2h55m).
    && (now - new Date(s.match_date).getTime()) / 60000 >= RECEIPT_AFTER_KO_MIN)
  .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
if (dueReceipt.length) {
  const s = dueReceipt[0];
  const id = s.match_external_id;
  let verdictReady = false;
  try {
    const a = await getJson(`${API}/analysis/${id}`);
    verdictReady = !!(a?.verdict?.call || a?.verdict?.scoreline || a?.data?.verdict?.scoreline);
  } catch { /* analysis hiccup — treat as not ready */ }
  const waited = state.verdictWait[id] || 0;
  if (!verdictReady && waited < MAX_VERDICT_HOLDS) {
    state.verdictWait[id] = waited + 1;
    console.log(`receipt for ${id} HELD (verdict not ready yet, hold ${waited + 1}/${MAX_VERDICT_HOLDS}) — next tick retries`);
  } else {
    const owed = owedOf(id);
    console.log(`receipt due: ${s.home_team} v ${s.away_team} (${id})${verdictReady ? '' : ' — posting without verdict after max holds'} → owed: ${owed.join(', ')}`);
    if (gen(['match', id])) {
      const payload = JSON.parse(readFileSync(path.join(OUT, 'match.json'), 'utf8'));
      if (!payload.skip) {
        ensurePending(id, 'match', `${s.home_team} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${s.away_team}`);
        stampPayload('match.json', id, owedOf(id));
        actions.push('match');
      }
      delete state.verdictWait[id];
    }
    if (dueReceipt.length > 1) console.log(`${dueReceipt.length - 1} more receipts due — next tick takes the next one`);
  }
}

writeFileSync(path.join(OUT, 'state-next.json'), JSON.stringify(state, null, 2));
writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify({ actions }, null, 2));
console.log(actions.length ? `due this tick: ${actions.join(' + ')}` : 'nothing due this tick');

// ── 4. scoring alarm (after the useful work, so it never blocks posts) ─
// Reuses the fixtures feed fetched at the top + the post-grade ledger: if a
// game is STILL ungraded this long after KO, even the forced grade couldn't
// score it — that's a real problem worth an email.
const scoredIds = new Set(settled.map(s => s.match_external_id));
const overdue = (allFx.fixtures || []).find(f =>
  f.league?.code === 'WC'
  && ['FINISHED', 'FT'].includes(f.status)
  && f.date && (now - new Date(f.date).getTime()) / 60000 > SCORING_GRACE_MIN
  && (now - new Date(f.date).getTime()) / 60000 < 48 * 60
  && !scoredIds.has(f.id));
if (overdue) {
  console.error(`SCORING OVERDUE: ${overdue.homeTeam?.name} v ${overdue.awayTeam?.name} (${overdue.id}) finished ~${Math.round((now - new Date(overdue.date)) / 3600000)}h after KO and is still ungraded — check ingestResults.`);
  process.exit(1);
}

// A card generation failed this tick (logged above). State + the overdue alarm
// have already run; now surface the failure so the run goes red (email).
if (genFailed) process.exit(1);
