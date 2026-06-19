// ─── WC DISPLAY PREDICTION — SINGLE SOURCE OF TRUTH ─────────────────
// Every surface that shows a World Cup probability (fixture cards, the
// match analysis page, the Markets tab) MUST go through this module.
//
// The rule that keeps the site honest:
//   1. Once the lock job (jobs/wcPredictionLock.js) has written the final
//      pre-kickoff 'wc-elo-market-v1' row, every view serves THAT row —
//      it is the prediction the public Brier score will judge.
//   2. Before lock, all views compute through computeWcPrediction() with
//      identical inputs (cached form context + The Odds API consensus)
//      and share a short cache, so two views rendered minutes apart can
//      never contradict each other.
//
// History: the card, the page and the Markets tab each built their own
// numbers (different odds snapshots, an API-Football blend only on the
// page, a club-model default on the Markets tab) — the same fixture
// showed 78% / 64% / 38% at the same time. That is the one failure mode
// a "we publish our error rate" brand cannot afford.

import * as toa from './sources/theOddsApi.js';
import cacheService from './cache.js';
import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import { generateProbabilities } from '../engine/poissonCore.js';
import { getWcTeamForm, buildWcContext, isKnockoutRound } from './wcForm.js';
import { getMatchWeather, weatherNote } from './weather.js';
import { lineupAwareAvailability } from './lineups.js';
import { motivationFactor, stakesTag } from '../engine/stakes.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

const MODEL_VERSION = 'wc-elo-market-v1';
// International friendlies are locked + scored under their own model version
// so the public Brier can be read per-model (WC vs friendlies vs club) —
// same Elo+market engine, different prediction problem, separate ledger.
export const INTL_MODEL_VERSION = 'intl-elo-market-v1';
const LOCKED_MODEL_VERSIONS = [MODEL_VERSION, INTL_MODEL_VERSION];
const PRE_LOCK_TTL_S = 600;     // pre-lock predictions shared for 10 min
const TOA_EVENTS_TTL_S = 600;   // one odds snapshot shared by all callers

// ─── Odds events (shared snapshot) ──────────────────────────────────
// One The Odds API fetch feeds every caller for 10 minutes — quota-friendly
// and, more importantly, every surface prices off the same snapshot.
export async function getSharedOddsEvents() {
  const ck = 'wc_toa_events';
  const cached = cacheService.get(ck);
  if (cached) return cached;
  if (!toa.hasKey()) return [];
  try {
    const events = await toa.getEvents();
    if (events?.length) cacheService.set(ck, events, TOA_EVENTS_TTL_S);
    return events || [];
  } catch {
    return [];
  }
}

// ─── Pre-lock compute (identical inputs for every caller) ───────────
// This is the lock job's exact recipe; the job itself calls this too,
// so "what the site shows" and "what gets scored" share one code path.
export async function computeWcPrediction(match, { oddsEvents = null, homeField = false, lineups = null, withWeather = false } = {}) {
  const events = oddsEvents ?? await getSharedOddsEvents();
  const ev = events?.length
    ? toa.matchEvent(events, match.homeTeam?.name, match.awayTeam?.name)
    : null;
  const marketProbs = ev ? toa.impliedProbs(ev) : null;

  // Friendlies are hosted, not neutral — and never knockout.
  let ctx = homeField ? { homeField: true } : {};
  let homeForm = null, awayForm = null;
  try {
    [homeForm, awayForm] = await Promise.all([
      getWcTeamForm(match.homeTeam?.id),
      getWcTeamForm(match.awayTeam?.id),
    ]);
    ctx = buildWcContext(match.date, homeForm, awayForm, {
      venueCity: match.city || match.venue || '',
      knockout: homeField ? false : isKnockoutRound(match.league?.round || match.matchday),
      ...(homeField ? { homeField: true } : {}),
    });
  } catch { /* context is optional — prediction still runs */ }

  // ── Confirmed lineups (lock job only — pre-lock cards pass nothing) ──
  // Sharpen availability with the real XI: an injured player confirmed OUT
  // weighs as a KEY absence; one confirmed STARTING has the penalty removed.
  // Strict no-op when no XI is supplied or published yet.
  if (lineups?.confirmed) {
    const sideId = (t) => String(t?.id || '').replace('apf_t_', '');
    const apply = (side, form) => {
      const xi = lineups.byTeam?.[sideId(match[side])];
      // Suspended players (red cards last match) are definitely out — evaluate
      // them through the same XI check as injuries so the absence survives lock.
      const unavailable = [...(form?.injuries || []), ...(form?.suspensions || [])];
      const la = lineupAwareAvailability(unavailable, xi?.starters || null);
      ctx.lineupsConfirmed = true;
      if (la.multiplier < 1) ctx[side === 'homeTeam' ? 'homeAvailability' : 'awayAvailability'] = la.multiplier;
      if (la.absences.length) ctx[side === 'homeTeam' ? 'homeStarAbsences' : 'awayStarAbsences'] = la.absences;
    };
    apply('homeTeam', homeForm);
    apply('awayTeam', awayForm);
  }

  // ── Stakes / motivation (group standing) ────────────────────────────
  // Only present when ENABLE_STAKES attached a `standing` to the cached form.
  // Bounded ±4%, group stage only (knockouts are max-stakes for everyone).
  const isGroupStage = !ctx.knockout;
  for (const [side, form] of [['home', homeForm], ['away', awayForm]]) {
    const st = form?.standing;
    if (!st) continue;
    const args = { isGroupStage, points: st.points, played: st.played };
    const f = motivationFactor(args);
    if (f !== 1.0) {
      ctx[side + 'Stakes'] = f;
      const tag = stakesTag(args);
      if (tag) ctx[side + 'StakesTag'] = tag;
    }
  }

  // ── Weather (lock job / analysis page) ──────────────────────────────
  // Free + cached; only fetched when asked, so the full-feed batch stays fast.
  let weather = null;
  if (withWeather) {
    try { weather = await getMatchWeather(match); } catch { weather = null; }
    if (weather) ctx.weather = weather;
  }

  const pred = predictWorldCupMatch(match.homeTeam?.name, match.awayTeam?.name, marketProbs, ctx);
  // Friendlies are a separate public ledger — label them as such on every
  // surface so the displayed model name matches the scored model_version.
  if (homeField && typeof pred.model === 'string') {
    pred.model = pred.model.replace(/^wc-/, 'intl-');
  }
  // Surface a plain-language weather line for the analysis page.
  const note = weatherNote(weather);
  if (note) pred.weatherNote = note;
  return { pred, ev, marketProbs, ctx };
}

// ─── Locked rows ────────────────────────────────────────────────────
// Only rows written by the lock job count as locked (features.lockedAt).
// Page-view snapshots (insert-only seeds) must NOT freeze the display.
function lockedRowToDisplay(row) {
  const lh = Number(row.lambda_home);
  const la = Number(row.lambda_away);
  const base = Number.isFinite(lh) && Number.isFinite(la)
    ? generateProbabilities(lh, la)
    : {};

  const probabilities = {
    home: Number(row.prob_home),
    draw: Number(row.prob_draw),
    away: Number(row.prob_away),
  };
  const f = row.features || {};

  const hasEdge = [row.value_edge_home, row.value_edge_draw, row.value_edge_away]
    .some(v => v !== null && v !== undefined);
  const valueEdges = hasEdge
    ? {
        home: row.value_edge_home != null ? Number(row.value_edge_home) : null,
        draw: row.value_edge_draw != null ? Number(row.value_edge_draw) : null,
        away: row.value_edge_away != null ? Number(row.value_edge_away) : null,
      }
    : null;

  const { home, draw, away } = probabilities;
  const bestPick = (home >= draw && home >= away)
    ? { name: `${row.home_team} win`, probability: home }
    : (away >= draw)
      ? { name: `${row.away_team} win`, probability: away }
      : { name: 'Draw', probability: draw };

  return {
    ...base,                       // topScorelines, overUnder, btts, matrix, expectedGoals
    probabilities,                 // the stored (scored) numbers override the grid's
    riskLevel: row.risk_level || base.riskLevel || 'MEDIUM',
    confidence: row.confidence != null ? Number(row.confidence) : undefined,
    model: row.model_version || MODEL_VERSION,
    bestPick,
    valueEdges,
    modelProbs: f.modelProbs || null,
    marketProbs: f.marketProbs || null,
    marketWeight: f.marketWeight ?? null,
    nationalStrength: f.nationalStrength || null,
    contextFactors: f.contextFactors || null,
    advance: f.advance || null,
    locked: true,
    lockedAt: f.lockedAt || null,
    // Reconstruct the plain-language weather line from the stored factors so
    // the locked row displays it identically to a fresh compute.
    weatherNote: (f.contextFactors?.weather && f.contextFactors.weather.effect < 0)
      ? `${Math.round(f.contextFactors.weather.feelsLike)}°C at kickoff — heat slows tempo`
      : undefined,
  };
}

/**
 * Batch-fetch locked predictions for a set of external fixture ids.
 * Returns a Map(externalId → display prediction). Missing/unlocked → absent.
 */
export async function getLockedWcPredictionsMap(externalIds) {
  const map = new Map();
  if (!isDbAvailable() || !externalIds?.length) return map;
  try {
    const r = await safeQuery(
      `SELECT DISTINCT ON (match_external_id) *
         FROM predictions
        WHERE model_version = ANY($1)
          AND match_external_id = ANY($2)
          AND features ? 'lockedAt'
        ORDER BY match_external_id, created_at DESC`,
      [LOCKED_MODEL_VERSIONS, externalIds.map(String)]
    );
    for (const row of r?.rows || []) {
      map.set(row.match_external_id, lockedRowToDisplay(row));
    }
  } catch (e) {
    console.warn('[wcDisplay] locked-row lookup failed:', e.message);
  }
  return map;
}

/**
 * THE accessor every route should use for a WC fixture's prediction.
 * Locked row → shared pre-lock cache → fresh compute (then cached).
 * Callers that already batch-checked locked rows (fixtures/all does ONE
 * query for the whole feed) pass skipLocked to avoid a per-fixture re-query.
 */
export async function getWcDisplayPrediction(match, { oddsEvents = null, skipLocked = false, homeField = false, withWeather = false } = {}) {
  if (!skipLocked) {
    const locked = await getLockedWcPredictionsMap([match.id]);
    if (locked.has(String(match.id))) return locked.get(String(match.id));
  }

  // Weather is only fetched on the single-match analysis path (withWeather);
  // the batched feed leaves it off so the full slate stays fast.
  const ck = `wc_display_${match.id}${withWeather ? '_wx' : ''}`;
  const cached = cacheService.get(ck);
  if (cached) return cached;

  const { pred } = await computeWcPrediction(match, { oddsEvents, homeField, withWeather });
  cacheService.set(ck, pred, PRE_LOCK_TTL_S);
  return pred;
}

/**
 * Model probabilities for the Markets tab (any fixture, WC or club).
 * Returns a flat { home, draw, away, over25, bttsYes } in PERCENT, or
 * null when no real model output exists — the tab then shows market
 * odds without a model column instead of a fabricated default.
 */
export async function getUnifiedModelProbs(fixtureId) {
  // 1. Locked WC row — the scored numbers.
  const locked = await getLockedWcPredictionsMap([fixtureId]);
  if (locked.has(String(fixtureId))) return flatten(locked.get(String(fixtureId)));

  // 2. Whatever the Analysis tab on the same page is showing.
  const analysis = cacheService.get(`full_analysis_v2_${fixtureId}`);
  if (analysis?.probability?.probabilities) return flatten(analysis.probability);

  // 3. The shared pre-lock WC prediction, if one has been computed.
  const wc = cacheService.get(`wc_display_${fixtureId}`);
  if (wc?.probabilities) return flatten(wc);

  // 4. Nothing real → nothing shown. Never predictStatic defaults here.
  return null;
}

function flatten(pred) {
  if (!pred?.probabilities) return null;
  return {
    home: pred.probabilities.home,
    draw: pred.probabilities.draw,
    away: pred.probabilities.away,
    over25: pred.overUnder?.over25 ?? null,
    bttsYes: pred.btts?.yes ?? null,
  };
}

export default {
  getSharedOddsEvents,
  computeWcPrediction,
  getLockedWcPredictionsMap,
  getWcDisplayPrediction,
  getUnifiedModelProbs,
};
