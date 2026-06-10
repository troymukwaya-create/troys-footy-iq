// ─── WORLD CUP TEAM FORM CACHE ──────────────────────────────────────
// Per-national-team recent form + injuries, refreshed in the background
// and persisted to the wc_team_form table. The fixtures feed and the
// prediction-lock job read ONLY from this cache, so the same context
// (form, rest days, availability) drives every surface — previously the
// feed predicted with no context at all and disagreed with the analysis
// page for the same match.

import api from './apisports.js';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { availabilityFromInjuredPlayers } from '../engine/playerImpact.js';

const WC_SEASON = 2026;             // API-Football season for World Cup 2026
const memory = new Map();           // teamId -> { form, loadedAt }
const MEMORY_TTL = 30 * 60 * 1000;  // re-read from DB every 30 min

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Refresh form + injuries for every team with a WC fixture in the next
 * `daysAhead` days. ~2 API calls per team, run from the scheduler.
 */
export async function refreshWcTeamForms(daysAhead = 8) {
  if (!api.hasKey()) return { refreshed: 0, reason: 'no API key' };

  let fixtures = [];
  try {
    fixtures = await api.getLeagueSeasonFixtures('WC', WC_SEASON);
  } catch (e) {
    console.warn('[wcForm] WC schedule fetch failed:', e.message);
    return { refreshed: 0, reason: e.message };
  }

  const now = Date.now();
  const horizon = now + daysAhead * 86400000;
  const teams = new Map(); // id -> name
  for (const f of fixtures) {
    const t = new Date(f.date).getTime();
    if (!(t > now - 86400000 && t < horizon)) continue;
    if (f.homeTeam?.id) teams.set(f.homeTeam.id, f.homeTeam.name);
    if (f.awayTeam?.id) teams.set(f.awayTeam.id, f.awayTeam.name);
  }

  let refreshed = 0;
  for (const [teamId, teamName] of teams) {
    try {
      const [form, injuries] = await Promise.all([
        api.getTeamRecentForm(teamId, 10).catch(() => null),
        api.getTeamInjuries(teamId).catch(() => []),
      ]);
      if (!form) continue;
      const blob = {
        ...form,
        injuries,
        availability: availabilityFromInjuredPlayers(injuries),
        refreshedAt: new Date().toISOString(),
      };
      memory.set(teamId, { form: blob, loadedAt: Date.now() });
      if (isDbAvailable()) {
        await safeQuery(
          `INSERT INTO wc_team_form (team_id, team_name, form, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (team_id) DO UPDATE SET
             team_name = EXCLUDED.team_name, form = EXCLUDED.form, updated_at = NOW()`,
          [teamId, teamName, JSON.stringify(blob)]
        );
      }
      refreshed++;
      await sleep(250); // stay polite to the API
    } catch (e) {
      console.warn(`[wcForm] refresh failed for ${teamName}:`, e.message);
    }
  }
  console.log(`[wcForm] Refreshed form for ${refreshed}/${teams.size} WC teams`);
  return { refreshed, teams: teams.size };
}

/**
 * Cached form for a team — memory first, then DB. NEVER calls the API:
 * the request path must stay fast, an empty result just means the
 * prediction runs without form context (graceful, like before).
 */
export async function getWcTeamForm(teamId) {
  if (!teamId) return null;
  const hit = memory.get(teamId);
  if (hit && Date.now() - hit.loadedAt < MEMORY_TTL) return hit.form;

  if (isDbAvailable()) {
    const r = await safeQuery(`SELECT form FROM wc_team_form WHERE team_id = $1`, [teamId]);
    const form = r?.rows?.[0]?.form || null;
    if (form) {
      const parsed = typeof form === 'string' ? JSON.parse(form) : form;
      memory.set(teamId, { form: parsed, loadedAt: Date.now() });
      return parsed;
    }
  }
  return hit?.form || null;
}

/** Build the prediction context for a WC match from cached form. */
export function buildWcContext(matchDate, homeForm, awayForm, extras = {}) {
  const ctx = { ...extras };
  if (homeForm) ctx.homeForm = homeForm;
  if (awayForm) ctx.awayForm = awayForm;
  const rest = (form) => {
    const last = form?.recentResults?.[0]?.date;
    if (!last || !matchDate) return null;
    const d = (new Date(matchDate) - new Date(last)) / 86400000;
    return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
  };
  const hRest = rest(homeForm), aRest = rest(awayForm);
  if (hRest != null) ctx.homeRestDays = hRest;
  if (aRest != null) ctx.awayRestDays = aRest;
  if (homeForm?.availability != null && homeForm.availability < 1) ctx.homeAvailability = homeForm.availability;
  if (awayForm?.availability != null && awayForm.availability < 1) ctx.awayAvailability = awayForm.availability;
  return ctx;
}

/** Knockout detection from the API-Football round string. */
export function isKnockoutRound(round = '') {
  return /round of|knockout|16|32|quarter|semi|final|3rd place|third place/i.test(String(round)) &&
         !/group/i.test(String(round));
}

export default { refreshWcTeamForms, getWcTeamForm, buildWcContext, isKnockoutRound };
