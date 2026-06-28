// ─── WORLD CUP PREDICTION LOCK ──────────────────────────────────────
// THE job that makes the public Brier score honest. The site's WC cards
// are computed on the fly and were never systematically stored — the only
// stored WC predictions came from the nightly club-model job (league-average
// defaults) or ad-hoc analysis page views. The published Brier would have
// scored a model nobody ever saw.
//
// Every cycle (10 min), for each WC fixture kicking off within LOCK_WINDOW:
//   1. Upsert the fixture row (guarantees scoring can match it later —
//      late-UTC kickoffs weren't ingested until after the match).
//   2. Build the same context the analysis page uses (cached form, rest,
//      availability, venue, knockout) + the market consensus.
//   3. UPSERT the prediction under model 'wc-elo-market-v1'. Re-upserting
//      until kickoff means the scored row is always the FINAL pre-kickoff
//      prediction — and it stores modelProbs + marketProbs in features so
//      the market-weight optimizer can learn from outcomes.
//   4. Snapshot consensus + best odds into odds_history (closing-line value).

import api from '../services/apisports.js';
import * as toa from '../services/sources/theOddsApi.js';
import { computeWcPrediction, INTL_MODEL_VERSION } from '../services/wcDisplayPrediction.js';
import { getConfirmedLineups } from '../services/lineups.js';
import { storePrediction } from '../services/predictionService.js';
import { upsertFixture } from '../db/upsert.js';
import { safeQuery, isDbAvailable } from '../db/index.js';
// SHADOW (all default-off): parallel fan-brain tracks, fully isolated from the
// scored write above — see writeShadowRows. Never affects wc-elo-market-v1.
import { fanbrainFlags } from '../config/fanbrainFlags.js';
import { buildShadowPredictions } from '../engine/shadowPredict.js';
import { scoutLambdaNudge } from '../services/scout.js';
import { getShadowCalibrationMap } from '../services/shadowCalibration.js';

const WC_SEASON = 2026;              // API-Football season for World Cup 2026
const LOCK_WINDOW_MIN = 75;          // start locking this many minutes before kickoff
const SCHEDULE_TTL = 3 * 3600_000;   // WC schedule cache (kickoff times are stable)

let _schedule = null;
let _scheduleAt = 0;
let _frSchedule = null;
let _frScheduleAt = 0;

async function getWcSchedule() {
  if (_schedule && Date.now() - _scheduleAt < SCHEDULE_TTL) return _schedule;
  const fixtures = await api.getLeagueSeasonFixtures('WC', WC_SEASON);
  if (fixtures?.length) { _schedule = fixtures; _scheduleAt = Date.now(); }
  return _schedule || [];
}

// Upcoming international friendlies (league 10) — today + tomorrow covers
// every possible 75-min lock window between schedule refreshes.
async function getFriendlySchedule() {
  if (_frSchedule && Date.now() - _frScheduleAt < SCHEDULE_TTL) return _frSchedule;
  const fixtures = await api.getInternationalFixtures(0, 1);
  _frSchedule = fixtures || [];
  _frScheduleAt = Date.now();
  return _frSchedule;
}

// Senior national teams only — league 10 also carries U17/U20/U23 + women's
// fixtures, which are not in the engine's Elo domain (same rule as the feed).
const isYouthTeam = (n) => /\bU-?\d{2}\b|youth|women/i.test(String(n || ''));
const isYouthFixture = (f) => isYouthTeam(f?.homeTeam?.name) || isYouthTeam(f?.awayTeam?.name);

async function leagueIdByCode(code) {
  const r = await safeQuery(`SELECT id FROM leagues WHERE code = $1`, [code]);
  return r?.rows?.[0]?.id || null;
}

// Lock one match: fixture upsert → shared-path prediction → upserted
// prediction row → odds snapshot. Used by both the WC and friendlies loops;
// the only differences are the model version, league code and homeField ctx.
async function lockOneMatch(match, { leagueId, leagueCode, modelVersion, homeField = false, oddsEvents }) {
  // 1. Fixture row must exist BEFORE kickoff so results can be matched.
  let fixtureRowOk = false;
  if (leagueId) {
    try { fixtureRowOk = !!(await upsertFixture(match, leagueId)); }
    catch (e) { console.warn(`[wcLock] fixture upsert failed for ${match.id}:`, e.message); }
  }

  // Confirmed XIs (~T-60) + match-day weather sharpen the FINAL locked row —
  // the one the public Brier scores. One lineups call per fixture (both
  // teams), cached; a strict no-op before the XIs are published (a later
  // 10-min cycle picks them up). Weather is free + cached.
  let lineups = null;
  try { lineups = await getConfirmedLineups(match.id); } catch { lineups = null; }

  // 2+3. Predict via the SHARED code path (services/wcDisplayPrediction):
  // the locked row is computed by literally the same function the cards
  // and the analysis page use, so display and scoring can never diverge.
  const { pred, ev, marketProbs, ctx } = await computeWcPrediction(match, { oddsEvents, homeField, lineups, withWeather: true });

  const best = ev?.markets?.['1X2']?.bestOdds || null;
  const odds = best?.Home && best?.Draw && best?.Away
    ? { home: best.Home.odd, draw: best.Draw.odd, away: best.Away.odd }
    : null;
  const valueEdges = pred.valueEdges
    ? [
        { outcome: 'Home', valueEdge: pred.valueEdges.home },
        { outcome: 'Draw', valueEdge: pred.valueEdges.draw },
        { outcome: 'Away', valueEdge: pred.valueEdges.away },
      ]
    : null;

  await storePrediction({
    matchExternalId: match.id,
    homeTeam: match.homeTeam?.name,
    awayTeam: match.awayTeam?.name,
    prediction: pred,
    odds,
    valueEdges,
    features: {
      modelProbs: pred.modelProbs,
      marketProbs: pred.marketProbs,
      marketWeight: pred.marketWeight,
      nationalStrength: pred.nationalStrength,
      contextFactors: pred.contextFactors,
      knockout: !!ctx.knockout,
      // advance is stored so locked knockout rows can still display
      // P(advance) — it is rehydrated by wcDisplayPrediction.
      advance: pred.advance || null,
      lockedAt: new Date().toISOString(),
    },
    leagueCode,
    modelVersion,
    upsert: true,
  });

  // 4. Odds snapshots → closing-line value tracking.
  if (ev && fixtureRowOk) await snapshotOdds(match.id, ev, marketProbs);

  const cf = pred.contextFactors || {};
  console.log(`[wcLock] 🔒 ${match.homeTeam?.name} vs ${match.awayTeam?.name} ` +
    `(${modelVersion}, market:${marketProbs ? marketProbs.source : 'none'}, ` +
    `form:${pred.nationalStrength?.recentMatchesUsed || 0}g, ko:${ctx.knockout ? 'y' : 'n'}` +
    `${cf.lineupsConfirmed ? ', XI✓' : ''}` +
    `${cf.weather && cf.weather.effect ? `, wx:${cf.weather.effect}%` : ''})`);

  // 5. SHADOW tracks (default-off). Runs AFTER the scored row is committed, in a
  //    blanket try/catch — a shadow failure can never affect the published Brier.
  await writeShadowRows({ match, ctx, leagueCode, marketProbs: pred.marketProbs });
}

// Write the parallel fan-brain shadow rows for one match. Market-BLIND: each
// track is scored on the PURE model (features.modelProbs); marketProbs is stored
// only for CLV reference. No-op (and silent) unless a shadow flag is on.
async function writeShadowRows({ match, ctx, leagueCode, marketProbs }) {
  if (!fanbrainFlags.anyShadowOn()) return;
  try {
    const homeName = match.homeTeam?.name, awayName = match.awayTeam?.name;
    if (!homeName || !awayName) return;

    let scoutMul = null, calMap = null;
    if (fanbrainFlags.scout()) { try { scoutMul = await scoutLambdaNudge(homeName, awayName, ctx); } catch { /* drop scout track */ } }
    if (fanbrainFlags.calibrationMap()) { try { calMap = await getShadowCalibrationMap(); } catch { /* drop cal track */ } }

    const tracks = buildShadowPredictions({ homeName, awayName, ctx, scoutMul, calMap });
    for (const t of tracks) {
      const p = t.probabilities;
      const bestPick = (p.home >= p.draw && p.home >= p.away) ? { name: `${homeName} win`, probability: p.home }
        : (p.away >= p.draw) ? { name: `${awayName} win`, probability: p.away }
        : { name: 'Draw', probability: p.draw };
      try {
        await storePrediction({
          matchExternalId: match.id,
          homeTeam: homeName,
          awayTeam: awayName,
          prediction: { probabilities: p, modelProbs: p, advance: t.advance, bestPick, expectedGoals: { home: t.lambda?.home, away: t.lambda?.away } },
          odds: null,
          valueEdges: null,
          features: {
            modelProbs: p,                       // PURE (market-blind) — what gets scored
            marketProbs: marketProbs || null,    // reference only (CLV); NOT blended in
            shadowLambda: t.lambda,
            shadowElo: t.elo,
            scout: /scout|fanbrain/.test(t.version) ? scoutMul : null,
            calibrated: /calibration|fanbrain/.test(t.version) && !!calMap,
            knockout: !!ctx.knockout,
            advance: t.advance || null,
            shadow: true,
            lockedAt: new Date().toISOString(),
          },
          leagueCode,
          modelVersion: t.version,
          upsert: true,
        });
      } catch (e) {
        console.warn(`[wcLock] shadow ${t.version} write failed for ${match.id}:`, e.message);
      }
    }
    if (tracks.length) {
      console.log(`[wcLock]   ↳ shadow: ${tracks.map(t => t.version.replace('wc-', '').replace('-shadow', '')).join(', ')}` +
        `${scoutMul ? ` (scout ${scoutMul.home}/${scoutMul.away})` : ''}`);
    }
  } catch (e) {
    console.warn('[wcLock] shadow block failed (ignored):', e.message);
  }
}

export async function runWcPredictionLock() {
  if (!api.hasKey() || !isDbAvailable()) return { locked: 0, reason: 'no API key or DB' };

  const now = Date.now();
  const windowEnd = now + LOCK_WINDOW_MIN * 60_000;
  const isDue = (f) => {
    const t = new Date(f.date).getTime();
    if (!(t > now && t <= windowEnd)) return false;
    return !f.status || ['SCHEDULED', 'TIMED', 'NS'].includes(f.status);
  };

  let wcDue = [];
  try { wcDue = (await getWcSchedule()).filter(isDue); }
  catch (e) { console.warn('[wcLock] schedule fetch failed:', e.message); }

  // International friendlies lock the same way under their own model version.
  // Fully isolated: a friendlies failure can never affect World Cup locking.
  let frDue = [];
  try { frDue = (await getFriendlySchedule()).filter(isDue).filter(f => !isYouthFixture(f)); }
  catch (e) { console.warn('[wcLock] friendlies schedule fetch failed:', e.message); }

  if (!wcDue.length && !frDue.length) return { locked: 0 };

  let oddsEvents = [];
  try { oddsEvents = await toa.getEvents(); } catch { /* market optional */ }

  let locked = 0;

  if (wcDue.length) {
    const leagueId = await leagueIdByCode('WC');
    for (const match of wcDue) {
      try {
        await lockOneMatch(match, {
          leagueId, leagueCode: 'WC', modelVersion: 'wc-elo-market-v1', oddsEvents,
        });
        locked++;
      } catch (e) {
        console.error(`[wcLock] failed for ${match.id}:`, e.message);
      }
    }
  }

  if (frDue.length) {
    const frLeagueId = await leagueIdByCode('FR');
    for (const match of frDue) {
      try {
        await lockOneMatch(match, {
          leagueId: frLeagueId, leagueCode: 'FR', modelVersion: INTL_MODEL_VERSION,
          homeField: true, oddsEvents,
        });
        locked++;
      } catch (e) {
        console.error(`[wcLock] friendly failed for ${match.id}:`, e.message);
      }
    }
  }

  if (locked) console.log(`[wcLock] Locked/refreshed ${locked} prediction(s) (WC due: ${wcDue.length}, FR due: ${frDue.length})`);
  return { locked };
}

async function snapshotOdds(externalId, ev, marketProbs) {
  const fx = await safeQuery(`SELECT id FROM fixtures WHERE external_id = $1`, [externalId]);
  const fixtureId = fx?.rows?.[0]?.id;
  if (!fixtureId) return;

  const rows = [];
  if (marketProbs) {
    for (const oc of ['home', 'draw', 'away']) {
      const p = marketProbs[oc];
      if (Number.isFinite(p) && p > 0) {
        rows.push(['consensus', '1X2', oc.toUpperCase(), parseFloat((100 / p).toFixed(3)), p]);
      }
    }
  }
  const best = ev?.markets?.['1X2']?.bestOdds || {};
  for (const [name, b] of Object.entries(best)) {
    if (b?.odd > 1) rows.push([b.bookmaker || 'best', '1X2', name.toUpperCase(), b.odd, b.impliedProbability]);
  }
  for (const r of rows) {
    await safeQuery(
      `INSERT INTO odds_history (fixture_id, bookmaker, market, outcome, odds_value, implied_prob)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [fixtureId, ...r]
    );
  }
}

export default { runWcPredictionLock };
