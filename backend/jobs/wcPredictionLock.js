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
import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import { getWcTeamForm, buildWcContext, isKnockoutRound } from '../services/wcForm.js';
import { storePrediction } from '../services/predictionService.js';
import { upsertFixture } from '../db/upsert.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

const WC_SEASON = 2026;              // API-Football season for World Cup 2026
const LOCK_WINDOW_MIN = 75;          // start locking this many minutes before kickoff
const SCHEDULE_TTL = 3 * 3600_000;   // WC schedule cache (kickoff times are stable)

let _schedule = null;
let _scheduleAt = 0;

async function getWcSchedule() {
  if (_schedule && Date.now() - _scheduleAt < SCHEDULE_TTL) return _schedule;
  const fixtures = await api.getLeagueSeasonFixtures('WC', WC_SEASON);
  if (fixtures?.length) { _schedule = fixtures; _scheduleAt = Date.now(); }
  return _schedule || [];
}

async function wcLeagueId() {
  const r = await safeQuery(`SELECT id FROM leagues WHERE code = 'WC'`);
  return r?.rows?.[0]?.id || null;
}

export async function runWcPredictionLock() {
  if (!api.hasKey() || !isDbAvailable()) return { locked: 0, reason: 'no API key or DB' };

  const now = Date.now();
  const windowEnd = now + LOCK_WINDOW_MIN * 60_000;

  let schedule;
  try { schedule = await getWcSchedule(); }
  catch (e) { console.warn('[wcLock] schedule fetch failed:', e.message); return { locked: 0 }; }

  const due = schedule.filter(f => {
    const t = new Date(f.date).getTime();
    if (!(t > now && t <= windowEnd)) return false;
    return !f.status || ['SCHEDULED', 'TIMED', 'NS'].includes(f.status);
  });
  if (!due.length) return { locked: 0 };

  const leagueId = await wcLeagueId();
  let oddsEvents = [];
  try { oddsEvents = await toa.getEvents(); } catch { /* market optional */ }

  let locked = 0;
  for (const match of due) {
    try {
      // 1. Fixture row must exist BEFORE kickoff so results can be matched.
      let fixtureRowOk = false;
      if (leagueId) {
        try { fixtureRowOk = !!(await upsertFixture(match, leagueId)); }
        catch (e) { console.warn(`[wcLock] fixture upsert failed for ${match.id}:`, e.message); }
      }

      // 2. Context — identical inputs to the analysis page, from cache only.
      const [homeForm, awayForm] = await Promise.all([
        getWcTeamForm(match.homeTeam?.id),
        getWcTeamForm(match.awayTeam?.id),
      ]);
      const ctx = buildWcContext(match.date, homeForm, awayForm, {
        venueCity: match.city || match.venue || '',
        knockout: isKnockoutRound(match.league?.round),
      });

      const ev = oddsEvents.length
        ? toa.matchEvent(oddsEvents, match.homeTeam?.name, match.awayTeam?.name)
        : null;
      const marketProbs = ev ? toa.impliedProbs(ev) : null;

      // 3. Predict + lock.
      const pred = predictWorldCupMatch(match.homeTeam?.name, match.awayTeam?.name, marketProbs, ctx);

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
          lockedAt: new Date().toISOString(),
        },
        leagueCode: 'WC',
        modelVersion: 'wc-elo-market-v1',
        upsert: true,
      });

      // 4. Odds snapshots → closing-line value tracking.
      if (ev && fixtureRowOk) await snapshotOdds(match.id, ev, marketProbs);

      locked++;
      console.log(`[wcLock] 🔒 ${match.homeTeam?.name} vs ${match.awayTeam?.name} ` +
        `(${pred.model}, market:${marketProbs ? marketProbs.source : 'none'}, ` +
        `form:${pred.nationalStrength?.recentMatchesUsed || 0}g, ko:${ctx.knockout ? 'y' : 'n'})`);
    } catch (e) {
      console.error(`[wcLock] failed for ${match.id}:`, e.message);
    }
  }

  if (locked) console.log(`[wcLock] Locked/refreshed ${locked} WC prediction(s)`);
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
