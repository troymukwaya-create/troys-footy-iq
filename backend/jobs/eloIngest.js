// ─── INTERNATIONAL RESULT → ELO LEARNING ────────────────────────────
// Feeds finished national-team results (qualifiers, friendlies, finals) into
// the Elo learner so the World Cup model sharpens from the games happening now.
//
// Sources:
//   - API-Football (paid): World Cup finals + international friendlies —
//     the June warm-up games football-data.org's free tier doesn't carry.
//   - football-data.org (free): WC/EC competitions, best-effort backup.
//
// DEDUP: the learning cycle runs every 6 hours over a 7-day window, so the
// same finished match used to be re-applied ~28 times — each pass dragging
// ratings further toward fully absorbing a single result. Every match id is
// now recorded in elo_processed_matches and applied exactly ONCE.
//
// NEUTRALITY: 2026 is a hosted World Cup — USA/Canada/Mexico home matches
// are NOT neutral (the prediction side already gives hosts an Elo edge; the
// learning side must price it too or host wins get over-credited).

import { applyResult } from '../engine/nationalTeams.js';
import api from '../services/apisports.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

// football-data.org competition codes that are national-team football.
const INTL_COMPETITIONS = 'WC,EC';   // World Cup + Euros (free-tier coverage)

const HOST_NATIONS = /^(usa|united states|canada|mexico)$/i;

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

// A World Cup finals match is only neutral when the "home" team isn't a host.
function isNeutral(homeName, importance) {
  if (importance === 'friendly') return false;            // home side usually hosts
  if (importance === 'world_cup' && HOST_NATIONS.test(String(homeName || '').trim())) return false;
  return true;
}

// ─── Dedup helpers ──────────────────────────────────────────────────
async function alreadyProcessed(matchId) {
  if (!matchId || !isDbAvailable()) return false;   // no DB → learn (in-memory only anyway)
  const r = await safeQuery(`SELECT 1 FROM elo_processed_matches WHERE match_id = $1`, [matchId]);
  return !!r?.rows?.length;
}

async function markProcessed(matchId) {
  if (!matchId || !isDbAvailable()) return;
  await safeQuery(
    `INSERT INTO elo_processed_matches (match_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [matchId]
  );
}

/**
 * Core learner — apply a batch of finished international results to Elo.
 * Each match (by id) shifts ratings exactly once, ever.
 * @param {Array<{id,homeName,awayName,homeGoals,awayGoals,neutral,importance}>} results
 */
export async function ingestInternationalEloResults(results = []) {
  let learned = 0, skipped = 0;
  const deltas = [];
  for (const r of results) {
    if (r?.homeGoals == null || r?.awayGoals == null) continue;
    if (await alreadyProcessed(r.id)) { skipped++; continue; }
    const out = await applyResult({
      homeName: r.homeName, awayName: r.awayName,
      homeGoals: r.homeGoals, awayGoals: r.awayGoals,
      neutral: r.neutral !== false,
      importance: r.importance || 'qualifier',
    });
    if (out) {
      await markProcessed(r.id);
      learned++;
      deltas.push({ home: out.home.name, away: out.away.name, delta: out.delta });
    }
  }
  return { learned, skipped, deltas };
}

/**
 * API-Football: finished WC finals + friendlies in the last `days`.
 */
export async function fetchInternationalResultsApiFootball(days = 7) {
  try {
    const matches = await api.getInternationalResults(days);
    return matches.map(m => ({
      id: m.id,                                        // 'apf_<fixtureId>'
      homeName: m.homeTeam?.name,
      awayName: m.awayTeam?.name,
      homeGoals: m.score.home,
      awayGoals: m.score.away,
      neutral: isNeutral(m.homeTeam?.name, m.eloImportance),
      importance: m.eloImportance,
    }));
  } catch (e) {
    console.warn('[eloIngest] API-Football fetch failed (non-fatal):', e.message);
    return [];
  }
}

/**
 * football-data.org: best-effort backup source (WC/EC codes).
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
      .map(m => {
        const importance = importanceOf(m.competition?.name);
        return {
          id: 'fd_' + m.id,
          homeName: m.homeTeam?.name,
          awayName: m.awayTeam?.name,
          homeGoals: m.score.fullTime.home,
          awayGoals: m.score.fullTime.away,
          neutral: isNeutral(m.homeTeam?.name, importance),
          importance,
        };
      });
  } catch (e) {
    console.warn('[eloIngest] fetch failed (non-fatal):', e.message);
    return [];
  }
}

/** Full cycle: fetch recent international results from both sources and learn. */
export async function runEloLearningCycle() {
  const [apf, fd] = await Promise.all([
    fetchInternationalResultsApiFootball(7),
    fetchRecentInternationalResults(7),
  ]);
  // API-Football first (richer coverage); FD entries for the same real-world
  // match have different ids, so dedupe across sources by team-pair + scoreline.
  const seen = new Set(apf.map(r => pairKey(r)));
  const results = [...apf, ...fd.filter(r => !seen.has(pairKey(r)))];

  if (!results.length) { console.log('[eloIngest] No new international results to learn from'); return { learned: 0 }; }
  const out = await ingestInternationalEloResults(results);
  console.log(`[eloIngest] Learned from ${out.learned} international results (${out.skipped} already processed)`);
  return out;
}

function pairKey(r) {
  const n = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  return `${n(r.homeName)}|${n(r.awayName)}|${r.homeGoals}-${r.awayGoals}`;
}

export default {
  ingestInternationalEloResults,
  fetchRecentInternationalResults,
  fetchInternationalResultsApiFootball,
  runEloLearningCycle,
};
