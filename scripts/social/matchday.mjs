// ─── MATCHDAY ORCHESTRATOR ──────────────────────────────────────────
// Runs every ~30 min (social-matchday.yml). Decides what is due and
// generates it via generate.mjs; the workflow hosts + publishes.
//
//   1. ENGINE CHECK   — /health must be green before we post anything.
//   2. PRE-MATCH      — every WC game gets its call card ~3h before
//                       kickoff (capture band 110–210 min pre-KO).
//   3. POST-MATCH     — every scored game gets its receipt within one
//                       tick of the engine grading it.
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
const PRE_MIN = 110, PRE_MAX = 210;          // pre-match capture band, minutes before KO
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
const [upcoming, recent] = await Promise.all([
  getJson(`${API}/fixtures/upcoming`),
  getJson(`${API}/results/recent`),
]);
const now = Date.now();
const wcUpcoming = (upcoming.fixtures || []).filter(f => f.league?.code === 'WC' && f.date);
const settled = (recent.data || []).filter(r => r.match_external_id);

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
    seededAt: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT, 'state-next.json'), JSON.stringify(state, null, 2));
  console.log(`baseline seeded: ${state.receipts.length} receipts + ${state.prematch.length} prematch marked as already handled — no posts this tick`);
  process.exit(0);
}

const gen = (args) => execFileSync('node', [path.join(DIR, 'generate.mjs'), ...args], { stdio: 'inherit', cwd: DIR });
const actions = [];

// ── 2. pre-match due? ────────────────────────────────────────────────
const duePre = wcUpcoming
  .filter(f => {
    const mins = (new Date(f.date) - now) / 60000;
    return mins >= PRE_MIN && mins <= PRE_MAX && !state.prematch.includes(f.id);
  })
  .sort((a, b) => new Date(a.date) - new Date(b.date));
if (duePre.length) {
  const f = duePre[0];
  console.log(`pre-match due: ${f.homeTeam?.name} v ${f.awayTeam?.name} (${f.id}), KO ${f.date}`);
  gen(['prematch', f.id]);
  const payload = JSON.parse(readFileSync(path.join(OUT, 'prematch.json'), 'utf8'));
  if (!payload.skip) { state.prematch.push(f.id); actions.push('prematch'); }
  if (duePre.length > 1) console.log(`${duePre.length - 1} more pre-match due — next tick takes the next one`);
}

// ── 3. receipt due? ──────────────────────────────────────────────────
const dueReceipt = settled
  .filter(s => !state.receipts.includes(s.match_external_id)
    && new Date(s.match_date).getTime() > now - 48 * 3600 * 1000)
  .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
if (dueReceipt.length) {
  const s = dueReceipt[0];
  console.log(`receipt due: ${s.home_team} v ${s.away_team} (${s.match_external_id})`);
  gen(['match', s.match_external_id]);
  const payload = JSON.parse(readFileSync(path.join(OUT, 'match.json'), 'utf8'));
  if (!payload.skip) { state.receipts.push(s.match_external_id); actions.push('match'); }
  if (dueReceipt.length > 1) console.log(`${dueReceipt.length - 1} more receipts due — next tick takes the next one`);
}

writeFileSync(path.join(OUT, 'state-next.json'), JSON.stringify(state, null, 2));
writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify({ actions }, null, 2));
console.log(actions.length ? `due this tick: ${actions.join(' + ')}` : 'nothing due this tick');

// ── 4. scoring alarm (after the useful work, so it never blocks posts) ─
const scoredIds = new Set(settled.map(s => s.match_external_id));
let overdue = null;
try {
  const all = await getJson(`${API}/fixtures/all`);
  overdue = (all.fixtures || []).find(f =>
    f.league?.code === 'WC'
    && ['FINISHED', 'FT'].includes(f.status)
    && f.date && (now - new Date(f.date).getTime()) / 60000 > SCORING_GRACE_MIN
    && (now - new Date(f.date).getTime()) / 60000 < 48 * 60
    && !scoredIds.has(f.id));
} catch { /* fixtures feed hiccup — alarm skipped this tick */ }
if (overdue) {
  console.error(`SCORING OVERDUE: ${overdue.homeTeam?.name} v ${overdue.awayTeam?.name} (${overdue.id}) finished ~${Math.round((now - new Date(overdue.date)) / 3600000)}h after KO and is still ungraded — check ingestResults.`);
  process.exit(1);
}
