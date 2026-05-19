import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
const router = express.Router();
import api from '../services/apisports.js';
import * as fd from '../services/footballdata.js';
import cacheService from '../services/cache.js';
import { predictStatic } from '../engine/inferenceEngine.js';
import { validateFixtureBatch, getValidationLog } from '../engine/fixtureValidator.js';
import { LOCKED_DEMO_FIXTURES } from '../config/lockedDemoFixtures.js';

// ─── LOCKED DEMO FALLBACK ────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH — imported from config/lockedDemoFixtures.js
// These are the 4 verified CL/EL semi-final matches for the investor demo.
// DO NOT define ad-hoc demo arrays anywhere else in the codebase.
// OLD: const DEMO = [...random domestic matches...] — REMOVED.
// ────────────────────────────────────────────────────────────────────────────

// Integrity state tracked at runtime
const integrityState = {
  lastFetchSource: null,
  lastFetchAt: null,
  servedFixtureIds: [],
  rejectedCount: 0,
  usedLockedFallback: false,
};

// Helper to attach cached predictions to a fixture
function attachPrediction(f) {
  const cached = cacheService.get('full_analysis_' + f.id);
  if (cached) {
    if (cached.ai) {
      f.ai_risk = cached.ai.risk_level || (cached.ai.confidence >= 70 ? 'LOW' : cached.ai.confidence >= 55 ? 'MEDIUM' : 'HIGH');
      f.ai_pick = cached.ai.recommendedPick || cached.ai.recommendedMarket;
    }
    if (cached.probability) {
      f.probability = cached.probability;
    }
  }
  if (!f.probability) {
    try {
      const pred = predictStatic({}, {});
      f.probability = {
        riskLevel: pred.riskLevel,
        probabilities: pred.probabilities,
        topScorelines: (pred.topScorelines || []).slice(0, 2),
        model: pred.model || 'hybrid-dixon-coles-v2',
      };
    } catch { /* ignore prediction errors — never crash */ }
  }
  return f;
}

// ─── PRIMARY DATA FETCH ──────────────────────────────────────────────────────
async function getAllFixturesData() {
  const hasToken = process.env.FOOTBALLDATA_TOKEN?.length > 10;
  const hasApsKey = api.hasKey();

  // ── PRIMARY: football-data.org ─────────────────────────────────────────────
  if (hasToken) {
    console.log('[fixtures] Fetching from football-data.org (including CL + EL)...');
    const today = new Date().toISOString().split('T')[0];
    const past   = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
    const future = new Date(Date.now() + 9 * 86400000).toISOString().split('T')[0];

    const [recent, upcoming] = await Promise.allSettled([
      fd.client.get('matches', { params: { competitions: fd.LEAGUE_CODES.join(','), dateFrom: past, dateTo: today } })
        .then(r => (r.data.matches || []).map(fd.normalise))
        .catch(e => { console.error('[fixtures] FD recent error:', e.response?.status, e.message); return []; }),
      fd.client.get('matches', { params: { competitions: fd.LEAGUE_CODES.join(','), dateFrom: today, dateTo: future } })
        .then(r => (r.data.matches || []).map(fd.normalise))
        .catch(e => { console.error('[fixtures] FD upcoming error:', e.response?.status, e.message); return []; }),
    ]);

    const raw = [
      ...(recent.status === 'fulfilled' ? recent.value : []),
      ...(upcoming.status === 'fulfilled' ? upcoming.value : []),
    ];

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    const { valid, rejected, rejectedCount } = validateFixtureBatch(raw, 'footballdata');
    integrityState.rejectedCount += rejectedCount;

    // Deduplicate by ID
    const seen = new Set();
    const fixtures = [];
    for (const f of valid) {
      if (!seen.has(f.id)) { seen.add(f.id); fixtures.push(f); }
    }

    // ── INJECT LOCKED DEMO FIXTURES IF NO UEFA MATCHES FOUND ─────────────────
    // The free football-data.org plan does NOT return CL/EL fixtures.
    // We always inject the 4 verified semi-finals so the demo is never missing them.
    const hasCLorEL = fixtures.some(f => f.league?.code === 'CL' || f.league?.code === 'EL');
    if (!hasCLorEL) {
      console.log('[fixtures] ℹ️  No CL/EL fixtures from API — injecting locked demo semi-finals');
      const { valid: lockedValid } = validateFixtureBatch(LOCKED_DEMO_FIXTURES, 'locked_demo_inject');
      for (const f of lockedValid) {
        if (!seen.has(f.id)) { seen.add(f.id); fixtures.push(f); }
      }
    }

    fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));
    fixtures.forEach(attachPrediction);

    if (fixtures.length > 0) {
      integrityState.lastFetchSource = 'footballdata+locked_demo';
      integrityState.lastFetchAt = new Date().toISOString();
      integrityState.servedFixtureIds = fixtures.map(f => f.id);
      integrityState.usedLockedFallback = !hasCLorEL;
      return { fixtures, source: hasCLorEL ? 'footballdata' : 'footballdata+demo_locked' };
    }
  }

  // ── SECONDARY: API-Sports ──────────────────────────────────────────────────
  if (hasApsKey) {
    console.log('[fixtures] Fetching from API-Sports...');
    const [recent, todayMatches, upcoming] = await Promise.all([
      api.getRecentFixtures(2).catch(() => []),
      api.getTodayFixtures().catch(() => []),
      api.getUpcomingFixtures(14).catch(() => []),
    ]);

    const raw = [...recent, ...todayMatches, ...upcoming];
    const { valid, rejected, rejectedCount } = validateFixtureBatch(raw, 'apisports');
    integrityState.rejectedCount += rejectedCount;

    const seen = new Set();
    const fixtures = [];
    for (const f of valid) {
      if (!seen.has(f.id)) { seen.add(f.id); fixtures.push(f); }
    }
    fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));
    fixtures.forEach(attachPrediction);

    if (fixtures.length > 0) {
      integrityState.lastFetchSource = 'apisports';
      integrityState.lastFetchAt = new Date().toISOString();
      integrityState.servedFixtureIds = fixtures.map(f => f.id);
      integrityState.usedLockedFallback = false;
      return { fixtures, source: 'apisports' };
    }
  }

  // ── FALLBACK: LOCKED DEMO FIXTURES (CL/EL semi-finals only) ───────────────
  // CRITICAL: We only show the 4 verified semi-finals. NEVER random domestic matches.
  console.warn('[fixtures] ⚠️  Both APIs unavailable — serving LOCKED demo fixtures (CL/EL semi-finals)');
  const { valid: lockedValid } = validateFixtureBatch(LOCKED_DEMO_FIXTURES, 'locked_demo');
  const withPredictions = lockedValid.map(attachPrediction);

  integrityState.lastFetchSource = 'locked_demo';
  integrityState.lastFetchAt = new Date().toISOString();
  integrityState.servedFixtureIds = withPredictions.map(f => f.id);
  integrityState.usedLockedFallback = true;

  return { fixtures: withPredictions, source: 'demo_locked' };
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

// GET /api/fixtures/all
router.get('/all', async (req, res) => {
  try {
    const data = await getAllFixturesData();
    const isDemo = data.source.includes('demo');
    res.json({ fixtures: data.fixtures, source: data.source, mode: isDemo ? 'demo' : 'live', total: data.fixtures.length });
  } catch (err) {
    console.error('[fixtures/all] Error:', err.message);
    // Even on crash, serve LOCKED demo fixtures — NEVER random domestic matches
    const { valid } = validateFixtureBatch(LOCKED_DEMO_FIXTURES, 'locked_demo_error_fallback');
    res.json({ fixtures: valid, source: 'demo_locked_error', mode: 'demo', total: valid.length });
  }
});

// GET /api/fixtures/upcoming
router.get('/upcoming', async (req, res) => {
  try {
    const data = await getAllFixturesData();
    const filtered = data.fixtures.filter(f => f.status === 'SCHEDULED' || f.status === 'NS');
    res.json({ fixtures: filtered, source: data.source, total: filtered.length });
  } catch (err) {
    const scheduled = LOCKED_DEMO_FIXTURES.filter(f => f.status === 'SCHEDULED');
    res.json({ fixtures: scheduled, source: 'demo_locked_error', total: scheduled.length });
  }
});

// GET /api/fixtures/finished
router.get('/finished', async (req, res) => {
  try {
    const data = await getAllFixturesData();
    const filtered = data.fixtures.filter(f => f.status === 'FINISHED' || f.status === 'FT');
    res.json({ fixtures: filtered, source: data.source, total: filtered.length });
  } catch (err) {
    res.json({ fixtures: [], source: 'demo_locked_error', total: 0 });
  }
});

// GET /api/fixtures/live
router.get('/live', async (req, res) => {
  try {
    const live = api.hasKey() ? await api.getLiveFixtures() : [];
    res.json(live);
  } catch (err) { res.json([]); }
});

// ─── INTEGRITY DEBUG ENDPOINT ─────────────────────────────────────────────────
// GET /api/debug/fixtures-integrity
// Exposes full validation state for manual verification before demo.
router.get('/integrity', async (req, res) => {
  try {
    // Fresh fetch to populate state
    const data = await getAllFixturesData();
    const validationLog = getValidationLog();

    res.json({
      status: 'ok',
      summary: {
        source: integrityState.lastFetchSource,
        fetchedAt: integrityState.lastFetchAt,
        totalServed: integrityState.servedFixtureIds.length,
        totalRejected: integrityState.rejectedCount,
        usingLockedFallback: integrityState.usedLockedFallback,
      },
      servedFixtures: data.fixtures.map(f => ({
        id: f.id,
        competition: f.league?.name,
        competitionCode: f.league?.code,
        home: f.homeTeam?.name,
        away: f.awayTeam?.name,
        kickoffUtc: f.date,
        kickoffLocal: f.date ? new Date(f.date).toLocaleString('en-GB', { timeZone: 'Europe/London' }) + ' BST' : null,
        status: f.status,
        source: f.source,
      })),
      rejectedFixtures: validationLog.slice(-50), // Last 50 rejections
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/team/:id',          async (req, res) => { try { res.json(await api.getTeamInfo(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/squad/:id',         async (req, res) => { try { res.json(await api.getSquad(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/team-fixtures/:id', async (req, res) => { try { res.json(await api.getTeamFixtures(req.params.id) || []); } catch(e) { res.json([]); } });

router.get('/:id/stats',       async (req, res) => { try { res.json(await api.getFixtureStats(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/:id/events',      async (req, res) => { try { res.json(await api.getFixtureEvents(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/lineups',     async (req, res) => { try { res.json(await api.getFixtureLineups(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/players',     async (req, res) => { try { res.json(await api.getFixturePlayers(req.params.id) || []); } catch(e) { res.json([]); } });
router.get('/:id/predictions', async (req, res) => { try { res.json(await api.getPredictions(req.params.id) || {}); } catch(e) { res.json({}); } });
router.get('/:id',             async (req, res) => { try { res.json(await api.getFixture(req.params.id) || {}); } catch(e) { res.json({}); } });

export default router;
