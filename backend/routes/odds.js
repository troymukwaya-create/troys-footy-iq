// ─── ODDS API ROUTES ────────────────────────────────────────────────
// Endpoints for live odds, value comparison, and parlay calculations.
// All data is for analytical/educational purposes only.

import { Router } from 'express';
import { getFixtureOdds, getTodayOdds, computeValueEdges, computeParlay } from '../services/oddsService.js';
import { getUnifiedModelProbs } from '../services/wcDisplayPrediction.js';
import { predictStatic } from '../engine/inferenceEngine.js';
import cache from '../services/cache.js';

const router = Router();

// ─── RESTRUCTURED MARKETS ENDPOINT ────────────────────────────────
// GET /api/odds/:fixtureId/markets
// Returns odds grouped by market → outcome (not by bookmaker).
// Each outcome includes best odds, alternatives, and value analysis.
router.get('/:fixtureId/markets', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Check cache
    const cacheKey = `markets_v2_${fixtureId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ error: false, data: cached, source: 'cache' });

    // Fetch raw odds
    let odds = await getFixtureOdds(fixtureId);
    if (!odds) odds = generateDemoOdds(fixtureId);

    // Model probabilities for value edges — the SAME numbers the Analysis tab
    // and the fixture card show (locked row → cached analysis → shared WC
    // prediction). If no real model output exists we show market odds with no
    // model column: a fabricated default here once recommended a 38%-model
    // "value pick" on an outcome the headline model priced at 16%.
    let modelProbs = null;
    try {
      modelProbs = await getUnifiedModelProbs(fixtureId);
    } catch { /* ignore — markets render without a model column */ }

    // Transform from bookmaker-grouped → outcome-grouped
    const markets = transformToOutcomeGrouped(odds, modelProbs);

    // Cache for 10 min — matches the shared WC prediction cadence, so the
    // Markets tab can never lag the Analysis tab by more than one cycle.
    cache.set(cacheKey, markets, 600);

    res.json({ error: false, data: markets, source: 'live' });
  } catch (err) {
    console.error('[ODDS/MARKETS] Error:', err.message);
    const fallback = generateDemoOdds(req.params.fixtureId);
    const markets = transformToOutcomeGrouped(fallback, null);
    res.json({ error: false, data: markets, source: 'fallback' });
  }
});

/**
 * Transform bookmaker-grouped odds into outcome-grouped format.
 * 
 * FROM: markets.1X2.bookmakers[{name, outcomes[{name, odd}]}]
 * TO:   markets[{type, label, outcomes[{name, best_odds, best_bookmaker, odds[], model_probability, market_probability, value_edge}]}]
 */
function transformToOutcomeGrouped(oddsData, modelProbs) {
  if (!oddsData?.markets) return [];

  const result = [];

  // Model prob mapping
  const modelMap = {
    'Home': modelProbs?.home || null,
    'Draw': modelProbs?.draw || null,
    'Away': modelProbs?.away || null,
    'Over 2.5': null,
    'Under 2.5': null,
    'Yes': null,
    'No': null,
  };

  // Derive over/under and BTTS from model if available
  if (modelProbs) {
    // Over 2.5 can be derived from over25 probability if present
    if (modelProbs.over25 != null) {
      modelMap['Over 2.5'] = modelProbs.over25;
      modelMap['Under 2.5'] = 100 - modelProbs.over25;
    }
    if (modelProbs.bttsYes != null) {
      modelMap['Yes'] = modelProbs.bttsYes;
      modelMap['No'] = 100 - modelProbs.bttsYes;
    }
  }

  for (const [marketKey, marketData] of Object.entries(oddsData.markets)) {
    if (!marketData?.bookmakers?.length) continue;

    // Collect all outcomes across bookmakers
    const outcomeMap = new Map();

    for (const bk of marketData.bookmakers) {
      for (const outcome of bk.outcomes) {
        if (!outcomeMap.has(outcome.name)) {
          outcomeMap.set(outcome.name, []);
        }
        outcomeMap.get(outcome.name).push({
          bookmaker: bk.name,
          value: outcome.odd,
          is_top: bk.isTop || false,
        });
      }
    }

    // Build outcome-grouped entries
    const outcomes = [];
    for (const [outcomeName, oddsList] of outcomeMap) {
      // Sort by odds descending (best first)
      oddsList.sort((a, b) => b.value - a.value);

      const bestEntry = oddsList[0];
      const bestOdd = bestEntry.value;
      const marketProbability = bestOdd > 0 ? round(1 / bestOdd, 4) : 0;
      const modelProbability = modelMap[outcomeName] != null
        ? round(modelMap[outcomeName] / 100, 4) // Convert from % to decimal
        : null;

      const valueEdge = modelProbability != null
        ? round(modelProbability - marketProbability, 4)
        : null;

      outcomes.push({
        name: outcomeName,
        best_odds: bestOdd,
        best_bookmaker: bestEntry.bookmaker,
        odds: oddsList.map(o => ({
          bookmaker: o.bookmaker,
          value: o.value,
        })),
        model_probability: modelProbability,
        market_probability: marketProbability,
        value_edge: valueEdge,
        value_signal: getValueSignal(valueEdge),
      });
    }

    result.push({
      type: marketKey,
      label: marketData.label || marketKey,
      outcomes,
    });
  }

  return result;
}

function getValueSignal(edge) {
  if (edge == null) return null;
  if (edge >= 0.05) return 'STRONG_VALUE';
  if (edge >= 0.02) return 'VALUE';
  if (edge >= -0.02) return 'FAIR';
  return 'NO_VALUE';
}

// ─── GET ODDS FOR A FIXTURE (legacy format) ───────────────────────
// GET /api/odds/:fixtureId
router.get('/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const odds = await getFixtureOdds(fixtureId);

    if (!odds) {
      return res.json({
        error: false,
        data: generateDemoOdds(fixtureId),
        source: 'demo',
      });
    }

    res.json({ error: false, data: odds, source: 'live' });
  } catch (err) {
    console.error('[ODDS] Route error:', err.message);
    res.json({ error: false, data: generateDemoOdds(req.params.fixtureId), source: 'fallback' });
  }
});

// ─── GET TODAY'S ODDS (BATCH) ──────────────────────────────────────
// GET /api/odds
router.get('/', async (_req, res) => {
  try {
    const odds = await getTodayOdds();
    res.json({ error: false, data: odds, total: odds.length });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── VALUE COMPARISON ──────────────────────────────────────────────
// GET /api/odds/:fixtureId/value
router.get('/:fixtureId/value', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    let odds = await getFixtureOdds(fixtureId);
    if (!odds) odds = generateDemoOdds(fixtureId);

    // Prefer the unified model (the numbers the rest of the site shows).
    // Only fall back to the stats-driven static model when the caller
    // supplied real team stats; bare defaults are never served as "value".
    const unified = await getUnifiedModelProbs(fixtureId).catch(() => null);
    let probabilities = null;
    let riskLevel = null;
    if (unified) {
      probabilities = { home: unified.home, draw: unified.draw, away: unified.away };
      const maxP = Math.max(unified.home, unified.draw, unified.away);
      riskLevel = maxP > 65 ? 'LOW' : maxP >= 45 ? 'MEDIUM' : 'HIGH';
    } else if (req.query.homeStats || req.query.awayStats) {
      const homeStats = req.query.homeStats ? JSON.parse(req.query.homeStats) : {};
      const awayStats = req.query.awayStats ? JSON.parse(req.query.awayStats) : {};
      const prediction = predictStatic(homeStats, awayStats);
      probabilities = prediction.probabilities;
      riskLevel = prediction.riskLevel;
    }

    if (!probabilities) {
      return res.json({
        error: false,
        data: { fixtureId, edges: [], modelProbabilities: null, riskLevel: null, bestPicks: [] },
      });
    }

    const edges = computeValueEdges(odds, probabilities);

    res.json({
      error: false,
      data: {
        fixtureId,
        edges,
        modelProbabilities: probabilities,
        riskLevel,
        bestPicks: edges.filter(e => e.hasValue),
      },
    });
  } catch (err) {
    console.error('[ODDS/VALUE] Error:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── PARLAY CALCULATION ────────────────────────────────────────────
// POST /api/odds/parlay/calculate
router.post('/parlay/calculate', (req, res) => {
  try {
    const { selections } = req.body;
    if (!Array.isArray(selections)) {
      return res.status(400).json({ error: true, message: 'selections array required' });
    }

    const result = computeParlay(selections);
    res.json({ error: false, data: result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * Generate realistic demo odds when API is unavailable.
 */
function generateDemoOdds(fixtureId) {
  const seed = hashCode(String(fixtureId));
  const homeOdd = 1.5 + (seed % 30) / 10;
  const drawOdd = 2.8 + (seed % 15) / 10;
  const awayOdd = 3.2 + (seed % 40) / 10;

  const bookmakers = [
    { name: 'Bet365', factor: [1.00, 1.00, 1.00] },
    { name: 'Pinnacle', factor: [1.02, 0.98, 1.01] },
    { name: '1xBet', factor: [1.04, 1.02, 0.99] },
    { name: 'Unibet', factor: [0.98, 1.01, 1.03] },
  ];

  const ou25Over = 1.7 + (seed % 10) / 20;
  const ou25Under = 2.0 + (seed % 8) / 20;
  const bttsYes = 1.65 + (seed % 12) / 20;
  const bttsNo = 2.0 + (seed % 10) / 20;

  return {
    fixtureId,
    markets: {
      '1X2': {
        market: '1X2',
        label: 'Match Winner',
        bookmakers: bookmakers.map(bk => ({
          name: bk.name,
          isTop: true,
          outcomes: [
            { name: 'Home', odd: round(homeOdd * bk.factor[0], 2), impliedProbability: round(100 / (homeOdd * bk.factor[0]), 1) },
            { name: 'Draw', odd: round(drawOdd * bk.factor[1], 2), impliedProbability: round(100 / (drawOdd * bk.factor[1]), 1) },
            { name: 'Away', odd: round(awayOdd * bk.factor[2], 2), impliedProbability: round(100 / (awayOdd * bk.factor[2]), 1) },
          ],
        })),
        bestOdds: {
          'Home': { odd: round(homeOdd * 1.04, 2), bookmaker: '1xBet', impliedProbability: round(100 / (homeOdd * 1.04), 1) },
          'Draw': { odd: round(drawOdd * 1.02, 2), bookmaker: '1xBet', impliedProbability: round(100 / (drawOdd * 1.02), 1) },
          'Away': { odd: round(awayOdd * 1.03, 2), bookmaker: 'Unibet', impliedProbability: round(100 / (awayOdd * 1.03), 1) },
        },
      },
      'OU25': {
        market: 'OU25',
        label: 'Over/Under 2.5',
        bookmakers: bookmakers.slice(0, 3).map((bk, i) => ({
          name: bk.name,
          isTop: true,
          outcomes: [
            { name: 'Over 2.5', odd: round(ou25Over * (1 + (i * 0.02)), 2), impliedProbability: round(100 / (ou25Over * (1 + (i * 0.02))), 1) },
            { name: 'Under 2.5', odd: round(ou25Under * (1 - (i * 0.01)), 2), impliedProbability: round(100 / (ou25Under * (1 - (i * 0.01))), 1) },
          ],
        })),
        bestOdds: {
          'Over 2.5': { odd: round(ou25Over * 1.04, 2), bookmaker: '1xBet', impliedProbability: round(100 / (ou25Over * 1.04), 1) },
          'Under 2.5': { odd: round(ou25Under, 2), bookmaker: 'Bet365', impliedProbability: round(100 / ou25Under, 1) },
        },
      },
      'BTTS': {
        market: 'BTTS',
        label: 'Both Teams Score',
        bookmakers: bookmakers.slice(0, 3).map((bk, i) => ({
          name: bk.name,
          isTop: true,
          outcomes: [
            { name: 'Yes', odd: round(bttsYes * (1 + (i * 0.015)), 2), impliedProbability: round(100 / (bttsYes * (1 + (i * 0.015))), 1) },
            { name: 'No', odd: round(bttsNo * (1 - (i * 0.01)), 2), impliedProbability: round(100 / (bttsNo * (1 - (i * 0.01))), 1) },
          ],
        })),
        bestOdds: {
          'Yes': { odd: round(bttsYes * 1.03, 2), bookmaker: '1xBet', impliedProbability: round(100 / (bttsYes * 1.03), 1) },
          'No': { odd: round(bttsNo, 2), bookmaker: 'Bet365', impliedProbability: round(100 / bttsNo, 1) },
        },
      },
    },
    fetchedAt: new Date().toISOString(),
    bookmakerCount: 4,
  };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function round(v, d) { return parseFloat(v.toFixed(d)); }

export default router;
