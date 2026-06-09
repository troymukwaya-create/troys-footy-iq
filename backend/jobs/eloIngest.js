// ─── INTERNATIONAL RESULT → ELO LEARNING ────────────────────────────
// Feeds finished national-team results (qualifiers, friendlies, finals) into
// the Elo learner so the World Cup model sharpens from the games happening now.
//
// ingestInternationalEloResults(results) is the testable core: give it an
// array of finished matches and it updates + persists every team's rating.
// fetchRecentInternationalResults() is a best-effort source via football-data.org.

import { applyResult } from '../engine/nationalTeams.js';

// football-data.org competition codes that are national-team football.
const INTL_COMPETITIONS = 'WC,EC';   // World Cup + Euros (free-tier coverage)

function hasFdToken() {
  const t = process.env.FOOTBALLDATA_TOKEN || '';
  return t.length > 8 && !t.startsWith('PASTE') && !t.startsWith('YOUR') && !t.includes('placeholder');
}

// Infer match importance (drives Elo K-factor) from the competition name.
function importanceOf(competitionName = '') {
  const c = competitionName.toLowerCase();
  if (c.includes('friendly')) return 'friendly';
  if (c.includes('qualif')) return 'qualifier';
  if (c.includes('nations')) return 'nations_league';
  if (c.includes('world cup') || c.includes('euro') || c.includes('championship')) return 'world_cup';
  return 'qualifier';
}

/**
 * Core learner — apply a batch of finished international results to Elo.
 * @param {Array<{homeName,awayName,homeGoals,awayGoals,neutral,importance}>} results
 */
export async function ingestInternationalEloResults(results = []) {
  let learned = 0;
  const deltas = [];
  for (const r of results) {
    if (r?.homeGoals == null || r?.awayGoals == null) continue;
    const out = await applyResult({
      homeName: r.homeName, awayName: r.awayName,
      homeGoals: r.homeGoals, awayGoals: r.awayGoals,
      neutral: r.neutral !== false,                 // internationals are usually neutral
      importance: r.importance || 'qualifier',
    });
    if (out) { learned++; deltas.push({ home: out.home.name, away: out.away.name, delta: out.delta }); }
  }
  return { learned, deltas };
}

/**
 * Best-effort fetch of recent finished international matches (last `days`).
 * Returns [] when no token / no data — the caller no-ops safely.
 */
export async function fetchRecentInternationalResults(days = 7) {
  if (!hasFdToken()) return [];
  try {
    const axios = (await import('axios')).default;
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const dateTo = new Date().toISOString().slice(0, 10);
    const r = await axios.get('https://api.football-data.org/v4/matches', {
      headers: { 'X-Auth-Token': process.env.FOOTBALLDATA_TOKEN },
      params: { competitions: INTL_COMPETITIONS, status: 'FINISHED', dateFrom, dateTo },
      timeout: 9000,
    });
    return (r.data?.matches || [])
      .filter(m => m.score?.fullTime?.home != null)
      .map(m => ({
        homeName: m.homeTeam?.name,
        awayName: m.awayTeam?.name,
        homeGoals: m.score.fullTime.home,
        awayGoals: m.score.fullTime.away,
        neutral: true,
        importance: importanceOf(m.competition?.name),
      }));
  } catch (e) {
    console.warn('[eloIngest] fetch failed (non-fatal):', e.message);
    return [];
  }
}

/** Full cycle: fetch recent international results and learn from them. */
export async function runEloLearningCycle() {
  const results = await fetchRecentInternationalResults(7);
  if (!results.length) { console.log('[eloIngest] No new international results to learn from'); return { learned: 0 }; }
  const out = await ingestInternationalEloResults(results);
  console.log(`[eloIngest] Learned from ${out.learned} international results`);
  return out;
}

export default { ingestInternationalEloResults, fetchRecentInternationalResults, runEloLearningCycle };
