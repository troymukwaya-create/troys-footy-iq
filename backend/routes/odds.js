// ─── ODDS API ROUTES ────────────────────────────────────────────────
// Endpoints for live odds, value comparison, and parlay calculations.
// All data is for analytical/educational purposes only.

import { Router } from 'express';
import { getFixtureOdds, getTodayOdds, computeValueEdges, computeParlay } from '../services/oddsService.js';
import { predictStatic } from '../engine/inferenceEngine.js';
import cache from '../services/cache.js';

const router = Router();

// ─── GET ODDS FOR A FIXTURE ────────────────────────────────────────
// GET /api/odds/:fixtureId
router.get('/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const odds = await getFixtureOdds(fixtureId);

    if (!odds) {
      // Return demo odds when API unavailable
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
// Compares bookmaker odds against our model probabilities
router.get('/:fixtureId/value', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get odds
    let odds = await getFixtureOdds(fixtureId);
    if (!odds) odds = generateDemoOdds(fixtureId);

    // Get model probabilities
    const homeStats = req.query.homeStats ? JSON.parse(req.query.homeStats) : {};
    const awayStats = req.query.awayStats ? JSON.parse(req.query.awayStats) : {};
    const prediction = predictStatic(homeStats, awayStats);

    // Compute edges
    const edges = computeValueEdges(odds, prediction.probabilities);

    res.json({
      error: false,
      data: {
        fixtureId,
        edges,
        modelProbabilities: prediction.probabilities,
        riskLevel: prediction.riskLevel,
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
// Body: { selections: [{ fixtureId, outcome, market, odd }] }
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
  // Generate slightly randomized but realistic odds
  const seed = hashCode(String(fixtureId));
  const homeOdd = 1.5 + (seed % 30) / 10;
  const drawOdd = 2.8 + (seed % 15) / 10;
  const awayOdd = 3.2 + (seed % 40) / 10;

  return {
    fixtureId,
    markets: {
      '1X2': {
        market: '1X2',
        label: 'Match Winner',
        bookmakers: [
          {
            name: 'Bet365', isTop: true,
            outcomes: [
              { name: 'Home', odd: round(homeOdd, 2), impliedProbability: round(100 / homeOdd, 1) },
              { name: 'Draw', odd: round(drawOdd, 2), impliedProbability: round(100 / drawOdd, 1) },
              { name: 'Away', odd: round(awayOdd, 2), impliedProbability: round(100 / awayOdd, 1) },
            ],
          },
          {
            name: 'Pinnacle', isTop: true,
            outcomes: [
              { name: 'Home', odd: round(homeOdd * 1.02, 2), impliedProbability: round(100 / (homeOdd * 1.02), 1) },
              { name: 'Draw', odd: round(drawOdd * 0.98, 2), impliedProbability: round(100 / (drawOdd * 0.98), 1) },
              { name: 'Away', odd: round(awayOdd * 1.01, 2), impliedProbability: round(100 / (awayOdd * 1.01), 1) },
            ],
          },
          {
            name: '1xBet', isTop: true,
            outcomes: [
              { name: 'Home', odd: round(homeOdd * 1.04, 2), impliedProbability: round(100 / (homeOdd * 1.04), 1) },
              { name: 'Draw', odd: round(drawOdd * 1.02, 2), impliedProbability: round(100 / (drawOdd * 1.02), 1) },
              { name: 'Away', odd: round(awayOdd * 0.99, 2), impliedProbability: round(100 / (awayOdd * 0.99), 1) },
            ],
          },
        ],
        bestOdds: {
          'Home': { odd: round(homeOdd * 1.04, 2), bookmaker: '1xBet', impliedProbability: round(100 / (homeOdd * 1.04), 1) },
          'Draw': { odd: round(drawOdd * 1.02, 2), bookmaker: '1xBet', impliedProbability: round(100 / (drawOdd * 1.02), 1) },
          'Away': { odd: round(awayOdd * 1.01, 2), bookmaker: 'Pinnacle', impliedProbability: round(100 / (awayOdd * 1.01), 1) },
        },
      },
      'OU25': {
        market: 'OU25',
        label: 'Over/Under 2.5',
        bookmakers: [
          {
            name: 'Bet365', isTop: true,
            outcomes: [
              { name: 'Over 2.5', odd: round(1.7 + (seed % 10) / 20, 2), impliedProbability: 0 },
              { name: 'Under 2.5', odd: round(2.0 + (seed % 8) / 20, 2), impliedProbability: 0 },
            ],
          },
        ],
        bestOdds: {},
      },
      'BTTS': {
        market: 'BTTS',
        label: 'Both Teams Score',
        bookmakers: [
          {
            name: 'Bet365', isTop: true,
            outcomes: [
              { name: 'Yes', odd: round(1.65 + (seed % 12) / 20, 2), impliedProbability: 0 },
              { name: 'No', odd: round(2.0 + (seed % 10) / 20, 2), impliedProbability: 0 },
            ],
          },
        ],
        bestOdds: {},
      },
    },
    fetchedAt: new Date().toISOString(),
    bookmakerCount: 3,
  };
}

// Fill in implied probabilities for demo data OU25/BTTS
function fillImplied(data) {
  for (const mk of Object.values(data.markets)) {
    for (const bk of mk.bookmakers) {
      for (const o of bk.outcomes) {
        if (!o.impliedProbability && o.odd) {
          o.impliedProbability = round(100 / o.odd, 1);
        }
      }
    }
  }
  return data;
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
