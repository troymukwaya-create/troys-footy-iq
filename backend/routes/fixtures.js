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
import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import { getWcDisplayPrediction, getLockedWcPredictionsMap, getSharedOddsEvents } from '../services/wcDisplayPrediction.js';
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
// Senior national teams only — API-Football's "Friendlies" league also
// carries U17/U20/U23 youth games, which don't belong in the feed.
const isYouthTeam = (n) => /\bU-?\d{2}\b|youth|women/i.test(String(n || ''));
const isYouthFixture = (f) => isYouthTeam(f?.homeTeam?.name) || isYouthTeam(f?.awayTeam?.name);

function attachPrediction(f) {
  // NOTE: analysis.js writes under 'full_analysis_v2_' — the old un-versioned
  // key silently never hit, so cards could not reuse the page's numbers.
  const cached = cacheService.get('full_analysis_v2_' + f.id);
  if (cached) {
    if (cached.ai) {
      f.ai_risk = cached.ai.risk_level || (cached.ai.confidence >= 70 ? 'LOW' : cached.ai.confidence >= 55 ? 'MEDIUM' : 'HIGH');
      f.ai_pick = cached.ai.recommendedPick || cached.ai.recommendedMarket;
    }
    if (cached.probability) {
      f.probability = cached.probability;
    }
  }
  // NEVER invent a "prediction" for a match that already finished — every
  // finished friendly was getting the identical generic default attached
  // post-hoc, which is exactly the kind of fake-looking number that
  // destroys trust. No pre-match prediction stored → show none.
  if (!f.probability && f.status !== 'FINISHED') {
    try {
      const isIntl = f.league?.code === 'WC' || f.league?.code === 'FR';
      const pred = isIntl
        ? predictWorldCupMatch(f.homeTeam?.name, f.awayTeam?.name, null,
            f.league?.code === 'FR' ? { homeField: true } : {})
        : predictStatic({}, {});
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

  // ── WORLD CUP SECTION ───────────────────────────────────────────────────────
  // Oddyessa is a full football site; the World Cup is a SECTION alongside the
  // club leagues. We always fetch the WC schedule (odds-blended predictions) and
  // merge it into the main multi-league feed below.
  let wcFixtures = [];
  const now = new Date();
  const inWcWindow = now >= new Date('2026-05-25T00:00:00Z') && now <= new Date('2026-07-20T23:59:59Z');
  const worldCupMode = process.env.WORLD_CUP_MODE === 'true'
    || (process.env.WORLD_CUP_MODE !== 'false' && inWcWindow);

  if (worldCupMode && hasApsKey) {
    const wcRaw = await api.getLeagueSeasonFixtures('WC', 2026)
      .catch(e => { console.error('[fixtures] WC fetch error:', e.message); return []; });
    const { valid, rejectedCount } = validateFixtureBatch(wcRaw, 'apisports_worldcup');
    integrityState.rejectedCount += rejectedCount;
    const seenWc = new Set();
    for (const f of valid) { if (!seenWc.has(f.id)) { seenWc.add(f.id); wcFixtures.push(f); } }
    wcFixtures.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Attach predictions through the ONE shared source (wcDisplayPrediction):
    // locked rows once the lock job has run, otherwise a shared 10-min-cached
    // compute — so the card, the analysis page, the Markets tab and the SCORED
    // prediction all show literally the same numbers.
    const wcOdds = await getSharedOddsEvents();
    const lockedMap = await getLockedWcPredictionsMap(wcFixtures.map(f => String(f.id)));
    for (const f of wcFixtures) {
      attachPrediction(f); // cache-attaches any AI verdict + base probability
      const pred = lockedMap.get(String(f.id))
        || await getWcDisplayPrediction(f, { oddsEvents: wcOdds, skipLocked: true });
      f.probability = {
        riskLevel: pred.riskLevel,
        probabilities: pred.probabilities,
        topScorelines: (pred.topScorelines || []).slice(0, 2),
        model: pred.model,
        valueEdges: pred.valueEdges,
        advance: pred.advance || undefined,   // knockout: P(advance) incl. ET/pens
        locked: pred.locked || undefined,     // true once the scored row is frozen
      };
    }
    console.log(`[fixtures] 🏆 World Cup section: ${wcFixtures.length} fixtures merged into the feed`);
  }

  // ── INTERNATIONAL FRIENDLIES ────────────────────────────────────────────────
  // Oddyessa is a football site, not a World Cup site — national-team
  // friendlies (England v Costa Rica, Portugal v Nigeria) belong in the feed.
  // Same Elo+market engine as the WC, with home-field advantage since
  // friendlies are hosted, not neutral. Yesterday's results show too.
  if (hasApsKey) {
    try {
      const intlRaw = await api.getInternationalFixtures(1, 7);
      const { valid: intlValid, rejectedCount: intlRejected } = validateFixtureBatch(intlRaw, 'apisports_friendlies');
      integrityState.rejectedCount += intlRejected;

      // Same pattern as the WC section: locked row once the lock job has
      // written one, otherwise the shared compute path (market + cached form,
      // homeField since friendlies are hosted). attachPrediction only carries
      // AI extras here — it must never be the headline number for a friendly,
      // because its fallback predicts with no market and no form context.
      const seenIntl = new Set(wcFixtures.map(f => f.id));
      const frFixtures = intlValid.filter(f => !seenIntl.has(f.id) && !isYouthFixture(f));
      const frLockedMap = await getLockedWcPredictionsMap(frFixtures.map(f => String(f.id)));
      const frOdds = await getSharedOddsEvents();
      for (const f of frFixtures) {
        seenIntl.add(f.id);
        attachPrediction(f);
        if (f.status !== 'FINISHED') {
          const pred = frLockedMap.get(String(f.id))
            || await getWcDisplayPrediction(f, { oddsEvents: frOdds, skipLocked: true, homeField: true });
          f.probability = {
            riskLevel: pred.riskLevel,
            probabilities: pred.probabilities,
            topScorelines: (pred.topScorelines || []).slice(0, 2),
            model: pred.model,
            valueEdges: pred.valueEdges,
            locked: pred.locked || undefined,
          };
        }
        wcFixtures.push(f); // rides the same merge as the WC section
      }
      console.log(`[fixtures] 🤝 Friendlies section: ${intlValid.length} fixtures merged into the feed`);
    } catch (e) {
      console.warn('[fixtures] friendlies fetch failed (non-fatal):', e.message);
    }
  }

  // Merge the World Cup section into whatever the club feed returns.
  const mergeWc = (clubFixtures, source) => {
    if (!wcFixtures.length) return { fixtures: clubFixtures, source };
    const ids = new Set(wcFixtures.map(f => f.id));
    const merged = [...wcFixtures, ...clubFixtures.filter(f => !ids.has(f.id))];
    merged.sort((a, b) => new Date(a.date) - new Date(b.date));
    return { fixtures: merged, source: `${source}+worldcup` };
  };

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
    if (!hasCLorEL && !wcFixtures.length) {
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
      return mergeWc(fixtures, hasCLorEL ? 'footballdata' : 'footballdata+demo_locked');
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
      if (seen.has(f.id) || isYouthFixture(f)) continue;
      seen.add(f.id);
      fixtures.push(f);
    }
    fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));
    fixtures.forEach(attachPrediction);

    if (fixtures.length > 0) {
      integrityState.lastFetchSource = 'apisports';
      integrityState.lastFetchAt = new Date().toISOString();
      integrityState.servedFixtureIds = fixtures.map(f => f.id);
      integrityState.usedLockedFallback = false;
      return mergeWc(fixtures, 'apisports');
    }
  }

  // ── FALLBACK: LOCKED DEMO FIXTURES (CL/EL semi-finals only) ───────────────
  // CRITICAL: We only show the 4 verified semi-finals. NEVER random domestic matches.
  // If the World Cup section has fixtures, show those rather than the club demo.
  if (wcFixtures.length) {
    integrityState.lastFetchSource = 'apisports_worldcup';
    integrityState.lastFetchAt = new Date().toISOString();
    integrityState.servedFixtureIds = wcFixtures.map(f => f.id);
    integrityState.usedLockedFallback = false;
    return { fixtures: wcFixtures, source: 'worldcup' };
  }

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
    const isDemo = data.source === 'demo_locked' || data.source === 'demo_locked_error';
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
    // Attach the locked pre-kickoff prediction to live WC matches — the card
    // can then show "we called it X% before kickoff" while the game runs.
    // Club live matches carry no prediction; the frontend renders them without
    // a probability strip instead of waiting on one that never arrives.
    try {
      const lockedMap = await getLockedWcPredictionsMap(live.map(f => String(f.id)));
      for (const f of live) {
        const pred = lockedMap.get(String(f.id));
        if (pred) {
          f.probability = {
            riskLevel: pred.riskLevel,
            probabilities: pred.probabilities,
            model: pred.model,
            locked: true,
          };
        }
      }
    } catch { /* probability attachment is optional for live */ }
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

// Global team search (clubs + national teams). MUST be registered before the
// '/:id' catch-all below or 'search' would be read as a fixture id.
router.get('/search', async (req, res) => {
  try { res.json({ results: await api.searchTeams(req.query.q || '') }); }
  catch (e) { res.json({ results: [] }); }
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
