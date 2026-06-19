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
import { suspendedPlayersForTeam } from '../engine/suspensions.js';
import { blendFormWithXg, extractTeamXg } from '../engine/xgForm.js';

const WC_SEASON = 2026;             // API-Football season for World Cup 2026
const memory = new Map();           // teamId -> { form, loadedAt }
const MEMORY_TTL = 30 * 60 * 1000;  // re-read from DB every 30 min

// ─── POST-MATCHDAY SIGNAL FLAGS (default OFF — additive, A/B-able) ───
// Each enriches the cached form blob with a signal the base model is blind to.
// OFF by default so a deploy changes nothing live until the flag is flipped in
// Render; bounded + no-op without data even when ON. See engine/{suspensions,
// xgForm,stakes}.js. Extra API cost per team when ON (events / stats calls) —
// scoped to the most-recent / World-Cup matches and capped.
const flag = (k) => String(process.env[k] ?? 'false').toLowerCase() === 'true';
const ENABLE_SUSPENSIONS = flag('ENABLE_SUSPENSIONS');
const ENABLE_XG_FORM = flag('ENABLE_XG_FORM');
const ENABLE_STAKES = flag('ENABLE_STAKES');
const XG_MAX_MATCHES = 3;          // cap xG stat calls per team per refresh

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Suspended players (red cards) from a team's single most-recent finished
// match. One events call per team, only when the flag is on. Best-effort.
async function fetchSuspensions(teamId, teamName, form) {
  const last = (form?.recentResults || [])[0];   // most recent finished match
  if (!last?.id) return [];
  try {
    const events = await api.getFixtureEvents(last.id);
    return suspendedPlayersForTeam(events, { teamId, teamName });
  } catch { return []; }
}

// xG per recent World Cup match → regress goals toward xG. Only WC matches
// (which carry xG) and capped, to bound the stat-call budget.
async function fetchXgSamples(teamName, form) {
  const wcMatches = (form?.recentResults || [])
    .filter(r => r.id && (r.leagueCode === 'WC' || /world cup/i.test(r.competition || '')))
    .slice(0, XG_MAX_MATCHES);
  const samples = [];
  for (const m of wcMatches) {
    try {
      const stats = await api.getFixtureStats(m.id);
      const xg = extractTeamXg(stats, teamName);
      if (xg) samples.push(xg);
    } catch { /* skip this match */ }
  }
  return samples;
}

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

  // International friendlies are locked + scored too — their teams need the
  // same cached form context. Isolated: a failure here never blocks WC teams.
  try {
    const isYouth = (n) => /\bU-?\d{2}\b|youth|women/i.test(String(n || ''));
    const friendlies = (await api.getInternationalFixtures(0, daysAhead) || [])
      .filter(f => !isYouth(f.homeTeam?.name) && !isYouth(f.awayTeam?.name));
    fixtures = [...fixtures, ...friendlies];
  } catch (e) {
    console.warn('[wcForm] friendlies schedule fetch failed (non-fatal):', e.message);
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

  // Stakes: one standings call shared across all teams this refresh (flag-gated).
  // Keyed by team id so each team's blob can carry its own {points, played}.
  const standingsById = new Map();
  if (ENABLE_STAKES) {
    try {
      for (const s of (await api.getWcStandings()) || []) {
        standingsById.set(s.teamId, { points: s.points, played: s.played, group: s.group, goalsDiff: s.goalsDiff });
      }
    } catch (e) { console.warn('[wcForm] standings fetch failed (non-fatal):', e.message); }
  }

  let refreshed = 0;
  for (const [teamId, teamName] of teams) {
    try {
      const [form, injuries] = await Promise.all([
        api.getTeamRecentForm(teamId, 10).catch(() => null),
        api.getTeamInjuries(teamId).catch(() => []),
      ]);
      if (!form) continue;

      // ── Post-matchday enrichment (each flag-gated, each a no-op without data) ──
      let enrichedForm = form;
      let suspensions = [];
      if (ENABLE_SUSPENSIONS) suspensions = await fetchSuspensions(teamId, teamName, form);
      if (ENABLE_XG_FORM) {
        const xgSamples = await fetchXgSamples(teamName, form);
        enrichedForm = blendFormWithXg(form, xgSamples);
      }
      // A suspended player is DEFINITELY out — fold into the same availability
      // multiplier injuries use (deduped against the injury list by name).
      const injuryNames = new Set(injuries.map(i => String(i.name || '').toLowerCase()));
      const extraOut = suspensions.filter(s => !injuryNames.has(String(s.name || '').toLowerCase()));
      const unavailable = [...injuries, ...extraOut];
      const standing = standingsById.get(teamId) || null;

      const blob = {
        ...enrichedForm,
        injuries,
        suspensions,
        availability: availabilityFromInjuredPlayers(unavailable),
        ...(standing ? { standing } : {}),
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
