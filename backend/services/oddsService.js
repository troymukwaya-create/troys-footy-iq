// ─── ODDS SERVICE ───────────────────────────────────────────────────
// Fetches live bookmaker odds from API-Football, normalizes them,
// and computes implied probabilities + value edges vs our model.
// Caches aggressively to respect free-tier rate limits.

import api from './apisports.js';
import * as toa from './sources/theOddsApi.js';
import cache from './cache.js';
import { predictStatic } from '../engine/inferenceEngine.js';

const SUPPORTED_MARKETS = {
  'Match Winner': '1X2',
  'Home/Away':    '1X2',
  'Over/Under':   'OU25',
  'Goals Over/Under': 'OU25',
  'Both Teams Score': 'BTTS',
  'Both Teams - Loss': 'BTTS',
};

// Top bookmakers to display (reduces noise)
const TOP_BOOKMAKERS = [
  'Bet365', 'bet365',
  '1xBet', '1XBET',
  'Unibet',
  'Betway',
  'William Hill',
  'Pinnacle',
  'Marathonbet',
  'Bwin',
  '888sport',
  'Betfair',
];

const ODDS_CACHE_TTL = 900; // 15 minutes
const ODDS_REFRESH_COOLDOWN = 600_000; // 10 min in ms

// Track last fetch time per fixture to prevent over-fetching
const lastFetchTime = new Map();

/**
 * Fetch odds for a single fixture from API-Football.
 * Uses aggressive caching to stay within rate limits.
 */
export async function getFixtureOdds(fixtureId, teams = null) {
  const cacheKey = `odds_${fixtureId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Preferred: The Odds API (paid, broader bookmaker coverage), matched by team name.
  if (toa.hasKey() && teams?.home && teams?.away) {
    try {
      const ev = toa.matchEvent(await toa.getEvents(), teams.home, teams.away);
      if (ev) { cache.set(cacheKey, ev, ODDS_CACHE_TTL); return ev; }
    } catch (err) { console.warn('[ODDS] The Odds API match failed:', err.message); }
  }

  if (!api.hasKey()) return null;

  // Cooldown check
  const numId = String(fixtureId).replace('apf_', '').replace('fd_', '');
  const lastFetch = lastFetchTime.get(numId);
  if (lastFetch && Date.now() - lastFetch < ODDS_REFRESH_COOLDOWN) {
    return null; // Too soon to re-fetch
  }

  try {
    const response = await import('axios').then(ax =>
      ax.default.get('https://v3.football.api-sports.io/odds', {
        headers: { 'x-apisports-key': process.env.APISPORTS_KEY || '' },
        params: { fixture: numId },
        timeout: 12000,
      })
    );

    lastFetchTime.set(numId, Date.now());

    const rawBookmakers = response?.data?.response?.[0]?.bookmakers || [];
    if (rawBookmakers.length === 0) return null;

    const normalized = normalizeOdds(fixtureId, rawBookmakers);
    cache.set(cacheKey, normalized, ODDS_CACHE_TTL);
    return normalized;
  } catch (err) {
    console.error('[ODDS] Fetch error for', fixtureId, ':', err.message);
    return null;
  }
}

/**
 * Fetch odds for all today's fixtures (batch, rate-limited).
 */
export async function getTodayOdds() {
  const cacheKey = 'odds_today_batch';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Preferred: The Odds API (paid). Returns all upcoming soccer events normalized.
  if (toa.hasKey()) {
    try {
      const events = await toa.getEvents();
      if (events.length) {
        for (const ev of events) cache.set(`odds_${ev.fixtureId}`, ev, ODDS_CACHE_TTL);
        cache.set(cacheKey, events, 300);
        return events;
      }
    } catch (err) { console.warn('[ODDS] The Odds API batch failed:', err.message); }
  }

  if (!api.hasKey()) return [];

  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await import('axios').then(ax =>
      ax.default.get('https://v3.football.api-sports.io/odds', {
        headers: { 'x-apisports-key': process.env.APISPORTS_KEY || '' },
        params: { date: today },
        timeout: 15000,
      })
    );

    const all = response?.data?.response || [];
    const results = [];

    for (const entry of all) {
      const fixtureId = 'apf_' + entry.fixture?.id;
      const bookmakers = entry.bookmakers || [];
      if (bookmakers.length === 0) continue;

      const normalized = normalizeOdds(fixtureId, bookmakers);
      cache.set(`odds_${fixtureId}`, normalized, ODDS_CACHE_TTL);
      results.push(normalized);
    }

    cache.set(cacheKey, results, 300); // 5-min cache for batch
    return results;
  } catch (err) {
    console.error('[ODDS] Batch fetch error:', err.message);
    return [];
  }
}

/**
 * Normalize raw bookmaker odds into our structured format.
 */
function normalizeOdds(fixtureId, rawBookmakers) {
  const markets = {};

  for (const bk of rawBookmakers) {
    const bookmakerName = bk.name || 'Unknown';

    // Only include top bookmakers
    const isTop = TOP_BOOKMAKERS.some(
      tb => bookmakerName.toLowerCase().includes(tb.toLowerCase())
    );

    for (const bet of (bk.bets || [])) {
      const marketKey = SUPPORTED_MARKETS[bet.name];
      if (!marketKey) continue;

      if (!markets[marketKey]) {
        markets[marketKey] = {
          market: marketKey,
          label: marketKey === '1X2' ? 'Match Winner'
            : marketKey === 'OU25' ? 'Over/Under 2.5'
            : 'Both Teams Score',
          bookmakers: [],
        };
      }

      const outcomes = (bet.values || []).map(v => ({
        name: normalizeOutcomeName(v.value, marketKey),
        odd: parseFloat(v.odd) || 0,
        impliedProbability: v.odd ? parseFloat((1 / parseFloat(v.odd) * 100).toFixed(1)) : 0,
      })).filter(o => o.odd > 0);

      if (outcomes.length > 0) {
        markets[marketKey].bookmakers.push({
          name: bookmakerName,
          isTop,
          outcomes,
        });
      }
    }
  }

  // Sort bookmakers: top ones first, limit to 5
  for (const mk of Object.values(markets)) {
    mk.bookmakers.sort((a, b) => (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0));
    mk.bookmakers = mk.bookmakers.slice(0, 5);

    // Compute best odds per outcome
    mk.bestOdds = computeBestOdds(mk.bookmakers);
  }

  return {
    fixtureId,
    markets,
    fetchedAt: new Date().toISOString(),
    bookmakerCount: rawBookmakers.length,
  };
}

/**
 * Normalize outcome names across bookmakers.
 */
function normalizeOutcomeName(value, marketKey) {
  const v = String(value).trim();
  if (marketKey === '1X2') {
    if (v === 'Home' || v === '1') return 'Home';
    if (v === 'Draw' || v === 'X') return 'Draw';
    if (v === 'Away' || v === '2') return 'Away';
    return v;
  }
  if (marketKey === 'OU25') {
    if (v.includes('Over')) return 'Over 2.5';
    if (v.includes('Under')) return 'Under 2.5';
    return v;
  }
  if (marketKey === 'BTTS') {
    if (v === 'Yes' || v.toLowerCase().includes('yes')) return 'Yes';
    if (v === 'No' || v.toLowerCase().includes('no')) return 'No';
    return v;
  }
  return v;
}

/**
 * Find the best (highest) odds for each outcome across bookmakers.
 */
function computeBestOdds(bookmakers) {
  const best = {};
  for (const bk of bookmakers) {
    for (const outcome of bk.outcomes) {
      const key = outcome.name;
      if (!best[key] || outcome.odd > best[key].odd) {
        best[key] = {
          odd: outcome.odd,
          bookmaker: bk.name,
          impliedProbability: outcome.impliedProbability,
        };
      }
    }
  }
  return best;
}

/**
 * Compute value edges: model probability vs bookmaker implied probability.
 */
export function computeValueEdges(oddsData, modelProbabilities) {
  if (!oddsData?.markets?.['1X2'] || !modelProbabilities) return [];

  const market = oddsData.markets['1X2'];
  const edges = [];

  const outcomeMap = {
    'Home': modelProbabilities.home,
    'Draw': modelProbabilities.draw,
    'Away': modelProbabilities.away,
  };

  for (const [outcomeName, modelProb] of Object.entries(outcomeMap)) {
    if (!modelProb) continue;

    const best = market.bestOdds?.[outcomeName];
    if (!best) continue;

    // Normalize bookmaker probability (remove margin)
    const totalImplied = Object.values(market.bestOdds)
      .reduce((sum, o) => sum + (o.impliedProbability || 0), 0);
    const normalizedBkProb = totalImplied > 0
      ? (best.impliedProbability / totalImplied) * 100
      : best.impliedProbability;

    const edge = modelProb - normalizedBkProb;

    edges.push({
      outcome: outcomeName,
      modelProbability: parseFloat(modelProb.toFixed(1)),
      bookmakerProbability: parseFloat(normalizedBkProb.toFixed(1)),
      rawImpliedProbability: best.impliedProbability,
      bestOdd: best.odd,
      bestBookmaker: best.bookmaker,
      valueEdge: parseFloat(edge.toFixed(1)),
      hasValue: edge > 3, // 3%+ edge is considered value
      signal: edge > 5 ? 'STRONG_VALUE' : edge > 3 ? 'VALUE' : edge > -3 ? 'FAIR' : 'NO_VALUE',
    });
  }

  return edges;
}

/**
 * Compute parlay combined odds and risk.
 */
export function computeParlay(selections) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { totalOdds: 0, impliedProbability: 0, riskLevel: 'N/A', selections: [] };
  }

  let totalOdds = 1;
  let combinedProb = 1;

  for (const sel of selections) {
    const odd = parseFloat(sel.odd) || 1;
    totalOdds *= odd;
    combinedProb *= (1 / odd);
  }

  const impliedProbability = parseFloat((combinedProb * 100).toFixed(1));
  const riskLevel = impliedProbability > 40 ? 'LOW'
    : impliedProbability > 20 ? 'MEDIUM'
    : impliedProbability > 8 ? 'HIGH'
    : 'VERY_HIGH';

  return {
    totalOdds: parseFloat(totalOdds.toFixed(2)),
    impliedProbability,
    riskLevel,
    selections: selections.length,
  };
}

export default {
  getFixtureOdds,
  getTodayOdds,
  computeValueEdges,
  computeParlay,
};
