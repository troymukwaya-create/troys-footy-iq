// ─── CONFIRMED LINEUPS AT THE LOCK ──────────────────────────────────
// API-Football publishes confirmed starting XIs ~T-60. Our forecast locks
// at T-10, so the final locked prediction can use real lineup information —
// the single biggest pre-kickoff signal (a rested star benched, or a doubtful
// key player confirmed starting). One API call per fixture (the lineups
// endpoint returns BOTH teams), cached, and a strict no-op before the XIs
// are out (the 10-min lock cycle picks them up on a later pass).
//
// We do NOT spend per-player stat calls in the hot lock path. Instead we
// sharpen the availability we already derive from the injuries list: a player
// our data flags as injured who the XI confirms is OUT counts as a KEY
// absence (importance ↑); one confirmed STARTING despite an injury flag has
// the penalty removed (real new info, both directions). Bounded + pure-tested.

import apisports from './apisports.js';
import cacheService from './cache.js';
import { availabilityFromInjuredPlayers } from '../engine/playerImpact.js';

const CACHE_TTL_S = 600;   // 10 min — matches the lock cycle

// NFD decomposes accented letters; the [^a-z] strip then drops the combining
// marks (and spaces/punctuation), so 'Müller' and 'Mueller'→'muller'/'mller'
// normalise consistently for set membership.
const norm = (s) => String(s || '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '').trim();

/**
 * Confirmed starting XIs for a fixture, keyed by numeric team id.
 * @returns {{confirmed:boolean, byTeam:Object<string,{starters:Set<string>, count:number}>}}
 */
export async function getConfirmedLineups(matchExternalId) {
  const ck = `lineups_${matchExternalId}`;
  const cached = cacheService.get(ck);
  if (cached) return cached;

  let raw = [];
  try { raw = await apisports.getFixtureLineups(matchExternalId); }
  catch { raw = []; }

  // Lineups not published yet → confirmed:false (strict no-op). Don't cache a
  // miss for long: a later lock cycle must pick the XIs up once they drop.
  const byTeam = {};
  let confirmed = false;
  for (const t of raw || []) {
    const teamId = String(t?.team?.id ?? '');
    const xi = (t?.startXI || []).map(e => e?.player?.name).filter(Boolean);
    if (teamId && xi.length >= 7) {           // a real XI, not a stub
      byTeam[teamId] = { starters: new Set(xi.map(norm)), count: xi.length };
      confirmed = true;
    }
  }

  const result = { confirmed, byTeam };
  if (confirmed) cacheService.set(ck, result, CACHE_TTL_S);
  return result;
}

/**
 * Sharpen a team's availability multiplier using its confirmed XI.
 * Pure + dependency-free → unit-tested.
 *
 * @param {Array<{name:string}>} injuries  - our known injury list (names)
 * @param {Set<string>|null} starterNamesNorm - normalised confirmed starter names
 * @returns {{multiplier:number, absences:string[], confirmedFit:string[]}}
 */
export function lineupAwareAvailability(injuries = [], starterNamesNorm = null) {
  if (!starterNamesNorm || !starterNamesNorm.size) {
    // No XI yet → fall back to the standard injury-based multiplier.
    return { multiplier: availabilityFromInjuredPlayers(injuries), absences: [], confirmedFit: [] };
  }
  const out = [];        // injured AND confirmed not starting → genuinely out (key)
  const confirmedFit = []; // injured but confirmed STARTING → penalty removed
  for (const p of injuries || []) {
    const n = norm(p?.name);
    if (!n) continue;
    if (starterNamesNorm.has(n)) confirmedFit.push(p.name);
    else out.push(p.name);
  }
  // Confirmed-out injured players are weighted as KEY absences (0.7) — the XI
  // confirms they are not playing — vs the 0.4 "depth" default used when we
  // only had an injury rumour. Players confirmed starting drop out entirely.
  const weighted = out.map(() => ({ importance: 0.7 }));
  return {
    multiplier: availabilityFromInjuredPlayers(weighted),
    absences: out,
    confirmedFit,
  };
}

export default { getConfirmedLineups, lineupAwareAvailability };
