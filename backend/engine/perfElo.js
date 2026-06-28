// ─── PERFORMANCE ELO LADDER (shadow, REMEMBER) ──────────────────────────────
// A second Elo ladder that learns from the DESERVED result, not the scoreline.
// Same eloratings.net update math (eloLearning.js) but fed a SOFT result —
//   result_perf = 0.5·actualResult + 0.5·xgResult
// — and driven by the xG goal difference instead of the real one, so a team that
// out-creates 2.4–0.6 xG but loses 0–1 to a deflection still GAINS rating. It
// mirrors the national_elo system exactly (a learned-override map seeded from a
// table), and DEGRADES to plain Elo when xG is missing (teach nothing, not noise).
//
// Shadow-only: read by the wc-perf-elo-shadow track, never the scored path.
// Pure math (softResult / updatePerfElo / deservedUpdate) is unit-tested; the DB
// ladder + the cron apply are gated on PERF_ELO_SHADOW.

import { goalMultiplier, expectedScore, K_BY_IMPORTANCE } from './eloLearning.js';
import { getElo, norm } from './nationalTeams.js';
import { deservedResult } from './perception.js';
import { fanbrainFlags } from '../config/fanbrainFlags.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

// ── PURE: the soft-result update math ────────────────────────────────────────

/** Blend the real result (1/0.5/0, home perspective) with the xG-deserved result (0..1). */
export function softResult(actualResult, xgResult) {
  if (actualResult == null || xgResult == null) return null; // Number(null)===0 — guard first
  const a = Number(actualResult), x = Number(xgResult);
  if (!Number.isFinite(a) || !Number.isFinite(x)) return null;
  return 0.5 * a + 0.5 * x;
}

/**
 * Update both perf-Elo ratings from a soft result + the xG goal difference.
 * Mirrors eloLearning.updateElo, but `resultPerf` replaces win/draw/loss and
 * `xgGoalDiff` replaces the real goal diff in the multiplier.
 */
export function updatePerfElo(homeElo, awayElo, { resultPerf, xgGoalDiff, neutral = true, importance = 'world_cup' } = {}) {
  if (!Number.isFinite(resultPerf)) return null;
  const K = K_BY_IMPORTANCE[importance] ?? 40;
  const expected = expectedScore(homeElo, awayElo, neutral);
  const g = goalMultiplier(Math.round(Number(xgGoalDiff) || 0));
  const shift = K * g * (resultPerf - expected);
  return {
    homeElo: Math.round(homeElo + shift),
    awayElo: Math.round(awayElo - shift), // zero-sum
    delta: Math.round(shift),
    expected: parseFloat(expected.toFixed(3)),
    resultPerf: parseFloat(resultPerf.toFixed(3)),
  };
}

/**
 * Compute a perf-Elo update from a finished match's box score. Returns null when
 * there is no xG signal at all (caller degrades to plain Elo — teach nothing).
 * `home`/`away` carry { goals, xg, shotsOnTarget, shotsTotal }.
 */
export function deservedUpdate(homeElo, awayElo, home, away, { neutral = true, importance = 'world_cup' } = {}) {
  const hg = Number(home?.goals), ag = Number(away?.goals);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
  const der = deservedResult(home, away); // { value 0..1, source } or null
  if (!der) return null;                  // no xG and no shots ⇒ no perf lesson
  const actualResult = hg > ag ? 1 : hg === ag ? 0.5 : 0;
  const resultPerf = softResult(actualResult, der.value);
  const xgGoalDiff = (home?.xg != null && away?.xg != null) ? (Number(home.xg) - Number(away.xg)) : (hg - ag);
  const upd = updatePerfElo(homeElo, awayElo, { resultPerf, xgGoalDiff, neutral, importance });
  return upd ? { ...upd, source: der.source } : null;
}

// ── DB LADDER (gated on PERF_ELO_SHADOW + DB) ────────────────────────────────
const PERF_OVERRIDES = new Map(); // norm(name) -> perf elo

/** Create the shadow tables if absent (idempotent, safe). */
export async function ensurePerfEloTables() {
  if (!fanbrainFlags.perfElo() || !isDbAvailable()) return false;
  await safeQuery(`CREATE TABLE IF NOT EXISTS national_perf_elo (
    team_norm TEXT PRIMARY KEY, team_name TEXT, perf_elo NUMERIC, played INT DEFAULT 0, last_updated TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  await safeQuery(`CREATE TABLE IF NOT EXISTS perf_elo_processed_matches (
    match_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  return true;
}

/** Load learned perf-Elo overrides into memory (call at boot when flagged on). */
export async function loadPerfElo() {
  if (!fanbrainFlags.perfElo() || !isDbAvailable()) return 0;
  try {
    const r = await safeQuery('SELECT team_norm, perf_elo FROM national_perf_elo');
    let n = 0;
    for (const row of r?.rows || []) { PERF_OVERRIDES.set(row.team_norm, Number(row.perf_elo)); n++; }
    return n;
  } catch { return 0; }
}

/** Perf-Elo for a team — the learned value, else the base national Elo (seed). */
export function getPerfElo(name) {
  const n = norm(name);
  if (PERF_OVERRIDES.has(n)) return PERF_OVERRIDES.get(n);
  return getElo(name); // unlearned ⇒ start from the base ladder
}

export function resetPerfElo() { PERF_OVERRIDES.clear(); }

/**
 * Learn from one finished match (deduped). No-op unless PERF_ELO_SHADOW + DB.
 * Returns the update, or null when skipped (already processed, no xG signal…).
 */
export async function applyPerfResult({ matchId, homeName, awayName, home, away, neutral = true, importance = 'world_cup' }) {
  if (!fanbrainFlags.perfElo() || !isDbAvailable()) return null;
  if (matchId != null) {
    const seen = await safeQuery('SELECT 1 FROM perf_elo_processed_matches WHERE match_id = $1', [String(matchId)]).catch(() => null);
    if (seen?.rows?.length) return null; // dedup — apply each match once
  }
  const upd = deservedUpdate(getPerfElo(homeName), getPerfElo(awayName), home, away, { neutral, importance });
  if (!upd) return null; // degrade: no perf lesson (plain Elo still learns elsewhere)
  const hN = norm(homeName), aN = norm(awayName);
  PERF_OVERRIDES.set(hN, upd.homeElo);
  PERF_OVERRIDES.set(aN, upd.awayElo);
  const sql = `INSERT INTO national_perf_elo (team_norm, team_name, perf_elo, played, last_updated)
    VALUES ($1,$2,$3,1,NOW()) ON CONFLICT (team_norm) DO UPDATE SET
      perf_elo = EXCLUDED.perf_elo, team_name = EXCLUDED.team_name,
      played = national_perf_elo.played + 1, last_updated = NOW()`;
  await safeQuery(sql, [hN, homeName, upd.homeElo]).catch(() => {});
  await safeQuery(sql, [aN, awayName, upd.awayElo]).catch(() => {});
  if (matchId != null) await safeQuery('INSERT INTO perf_elo_processed_matches (match_id) VALUES ($1) ON CONFLICT DO NOTHING', [String(matchId)]).catch(() => {});
  return { home: { name: homeName, perfElo: upd.homeElo }, away: { name: awayName, perfElo: upd.awayElo }, delta: upd.delta, source: upd.source };
}

export default {
  softResult, updatePerfElo, deservedUpdate,
  ensurePerfEloTables, loadPerfElo, getPerfElo, resetPerfElo, applyPerfResult,
};
