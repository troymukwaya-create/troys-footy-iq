import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ─── ENV CONFIGURATION ─────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath, override: true });

// ─── STARTUP KEY VALIDATION ────────────────────────────────────────
console.log('==========================================');
console.log("  Oddyessa — Backend Startup");
console.log('==========================================');
console.log('  ENV loaded from:', envPath);

const APISPORTS_KEY = process.env.APISPORTS_KEY || '';
const FD_TOKEN = process.env.FOOTBALLDATA_TOKEN || '';
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || '';
const DB_URL = process.env.DATABASE_URL || '';

function isValidKey(key, minLen = 10) {
  return key && key.length >= minLen
    && !key.startsWith('YOUR') && !key.startsWith('PASTE')
    && !key.includes('placeholder') && !key.startsWith('API_KEY');
}

console.log(`  APISPORTS_KEY:     ${isValidKey(APISPORTS_KEY) ? 'YES (' + APISPORTS_KEY.slice(0,4) + '****)' : 'NO'}`);
console.log(`  FOOTBALLDATA_TOKEN: ${isValidKey(FD_TOKEN) ? 'YES (' + FD_TOKEN.slice(0,4) + '****)' : 'NO'}`);
console.log(`  ANTHROPIC_API_KEY: ${isValidKey(CLAUDE_KEY, 20) ? 'YES' : 'NO'}`);
console.log(`  DATABASE_URL:      ${DB_URL ? 'YES' : 'NO'}`);
console.log('==========================================');

if (!isValidKey(APISPORTS_KEY) && !isValidKey(FD_TOKEN)) {
  console.warn('⚠️  No API keys configured — app will use demo data.');
  console.warn('   Set APISPORTS_KEY or FOOTBALLDATA_TOKEN in backend/.env');
}

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

// Crash protection — log errors instead of dying
process.on('uncaughtException',  err => console.error('[CRASH PREVENTED]', err.message));
process.on('unhandledRejection', err => console.error('[PROMISE REJECTION]', err?.message || err));

import { initDb, query, isDbAvailable, getDbError } from './db/index.js';
import initJobs from './jobs/scheduler.js';
import { FD_LEAGUES, APF_LEAGUES } from './constants/leagues.js';
import dataRouter from './services/dataRouter.js';
import { upsertFixture, upsertTeam } from './db/upsert.js';

import leaguesRouter from './routes/leagues.js';
import fixturesRouter from './routes/fixtures.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import h2hRouter from './routes/h2h.js';
import aiRouter from './routes/ai.js';
import matchDataRouter from './routes/matchData.js';
import analysisRouter from './routes/analysis.js';
import engineRouter from './routes/engine.js';
import oddsRouter from './routes/odds.js';
import resultsRouter from './routes/results.js';
import backtestRouter from './routes/backtest.js';
import performanceRouter from './routes/performance.js';
import feedbackRouter from './routes/feedback.js';
import verifyRouter from './routes/verify.js';
import demoRouter from './routes/demo.js';
import adminRouter from './routes/admin.js';
import adminDetailRouter from './routes/adminDetail.js';
import adminOpsRouter from './routes/adminOps.js';
import trackRouter from './routes/track.js';
import subscribeRouter from './routes/subscribe.js';
import authRouter from './routes/auth.js';
import slipsRouter from './routes/slips.js';
import slipShareRouter from './routes/slipShare.js';
import { registerClientCounter } from './services/runtimeStats.js';

const app = express();
const port = process.env.PORT || 3001;

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

// Expose live WS client count to the admin dashboard (no circular import).
registerClientCounter(() => clients.size);

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'INIT', payload: { liveMatches: [], fixtures: [] } }));
});

export function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(message);
  });
}

// Production CORS — accept Vercel, localhost, and any configured frontend URL
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any .vercel.app domain
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    // Allow configured origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(null, true); // Permissive for now during deployment
  },
  credentials: true,
}));
app.use(express.json());

// ─── RESPONSE TIME LOGGING ──────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    if (elapsed > 300 && !req.url.includes('/health')) {
      console.warn(`[PERF] Slow response: ${req.method} ${req.url} — ${elapsed}ms`);
    }
  });
  next();
});

// ─── HEALTH CHECK ───────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const hasDb      = !!DB_URL;
  const dbConnected = isDbAvailable();
  const hasApi     = isValidKey(APISPORTS_KEY);
  const hasFd      = isValidKey(FD_TOKEN);
  const hasClaude  = isValidKey(CLAUDE_KEY, 20);

  const warnings = [];
  if (!hasDb)     warnings.push('DATABASE_URL not set — predictions will not be persisted');
  if (!hasApi && !hasFd) warnings.push('No data API keys set — demo mode active');
  if (!hasClaude) warnings.push('ANTHROPIC_API_KEY not set — AI analysis disabled');

  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    env: {
      hasDBUrl:       hasDb,
      dbConnected:    dbConnected,
      dbError:        dbConnected ? null : getDbError(),
      hasApisports:   !!hasApi,
      hasFootballdata: !!hasFd,
      hasClaude:      !!hasClaude,
      nodeEnv:        process.env.NODE_ENV || 'development',
    },
    warnings: warnings.length ? warnings : null,
  });
});

// ─── LIVENESS PROBE (external uptime pinger) ────────────────────────
// Minimal, dependency-free liveness check for an EXTERNAL monitor
// (UptimeRobot / cron-job.org). Pinging this every ~5 min keeps the Render
// free instance from sleeping, so cold visitors don't hit "Failed to load
// fixtures." The richer diagnostic probe lives at GET /health above.
// See docs/monday-setup-runbook.md.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ─── API STATUS ─────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const primarySource = isValidKey(APISPORTS_KEY) ? 'apisports'
    : isValidKey(FD_TOKEN) ? 'footballdata'
    : 'demo';
  res.json({
    apisports: isValidKey(APISPORTS_KEY),
    footballdata: isValidKey(FD_TOKEN),
    claude: isValidKey(CLAUDE_KEY, 20),
    primarySource,
    usingDemo: primarySource === 'demo',
  });
});

// ─── ROUTES (with defensive wrappers) ───────────────────────────────
function safeMount(path, router, name) {
  try {
    app.use(path, router);
  } catch (e) {
    console.error(`[ROUTE MOUNT FAILED] ${name}:`, e.message);
  }
}

safeMount('/api/leagues', leaguesRouter, 'leagues');
safeMount('/api/fixtures', fixturesRouter, 'fixtures');
safeMount('/api/teams', teamsRouter, 'teams');
safeMount('/api/players', playersRouter, 'players');
safeMount('/api/h2h', h2hRouter, 'h2h');
safeMount('/api/ai', aiRouter, 'ai');
safeMount('/api/match-data', matchDataRouter, 'match-data');
safeMount('/api/analysis', analysisRouter, 'analysis');
safeMount('/api/engine', engineRouter, 'engine');
safeMount('/api/odds', oddsRouter, 'odds');
safeMount('/api/results', resultsRouter, 'results');
safeMount('/api/backtest', backtestRouter, 'backtest');
safeMount('/api/performance', performanceRouter, 'performance');
safeMount('/api/feedback', feedbackRouter, 'feedback');
safeMount('/api/model', feedbackRouter, 'model');  // Mount feedback routes under /api/model too
safeMount('/api/verify', verifyRouter, 'verify');
safeMount('/api/monitor', verifyRouter, 'monitor');
safeMount('/api/demo', demoRouter, 'demo');
safeMount('/api/track', trackRouter, 'track');   // public first-party analytics ingestion
safeMount('/api/subscribe', subscribeRouter, 'subscribe'); // email capture / CRM list
safeMount('/api/auth', authRouter, 'auth');                // passwordless magic-link login
safeMount('/api/slips', slipsRouter, 'slips');             // saved slips (account)
safeMount('/api/slip-share', slipShareRouter, 'slip-share'); // public slip share codes (?slip=CODE)
safeMount('/api/admin', adminRouter, 'admin');         // CEO command center (token-protected)
safeMount('/api/admin', adminDetailRouter, 'admin-detail'); // drill-down detail endpoints
safeMount('/api/admin', adminOpsRouter, 'admin-ops');  // mission control: ops feed + buttons

// Debug / integrity routes — served from the fixtures router
// GET /api/debug/fixtures-integrity
app.use('/api/debug', fixturesRouter);

// ─── MODEL PERFORMANCE ENDPOINT ─────────────────────────────────────
app.get('/api/model/performance', async (_req, res) => {
  try {
    const { getModelPerformance } = await import('./pipeline/evaluate.js');
    const runs = await getModelPerformance(20);
    const predCount = await query('SELECT COUNT(*) as total, COUNT(actual_result) as evaluated FROM predictions');
    res.json({
      model_runs: runs,
      predictions: {
        total: parseInt(predCount.rows[0]?.total || 0),
        evaluated: parseInt(predCount.rows[0]?.evaluated || 0),
        pending: parseInt(predCount.rows[0]?.total || 0) - parseInt(predCount.rows[0]?.evaluated || 0),
      },
    });
  } catch (err) {
    res.json({ model_runs: [], predictions: { total: 0, evaluated: 0, pending: 0 }, error: err.message });
  }
});

// ─── SEED INITIAL DATA ─────────────────────────────────────────────
async function seedInitialData() {
  console.log('Seeding initial data...');
  try {
    const { rows } = await query('SELECT id, code FROM leagues');
    let leagueMap = {};
    if (rows.length === 0) {
      for (const [code, l] of Object.entries(FD_LEAGUES)) {
        const r = await query(`INSERT INTO leagues (code, name, country, source) VALUES ($1, $2, $3, 'footballdata') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id, code`, [code, l.name, l.country]);
        leagueMap[code] = r.rows[0].id;
      }
      for (const [code, l] of Object.entries(APF_LEAGUES)) {
        const r = await query(`INSERT INTO leagues (code, name, country, source) VALUES ($1, $2, $3, 'apifootball') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id, code`, [code, l.name, l.country]);
        leagueMap[code] = r.rows[0].id;
      }

      // Only fetch fixtures and standings on first-ever run (leagues table was empty).
      // Skipped on restarts to preserve API quota (standings = ~12 API calls).
      console.log('First run — fetching today fixtures...');
      const todayMatches = await dataRouter.getTodayFixtures();
      for (const match of todayMatches) {
        if (match.league && match.league.code && leagueMap[match.league.code]) {
          await upsertFixture(match, leagueMap[match.league.code]);
        }
      }

      console.log('First run — seeding standings...');
      for (const code of [...Object.keys(FD_LEAGUES), ...Object.keys(APF_LEAGUES)]) {
        const standings = await dataRouter.getStandings(code).catch(() => []);
        const leagueId = leagueMap[code];
        if (!leagueId || !standings || standings.length === 0) continue;

        for (const row of standings) {
          const teamId = await upsertTeam(row.team, leagueId);
          if (!teamId) continue;
          await query(`
            INSERT INTO league_standings (league_id, team_id, season, rank, points, played, won, drawn, lost, goals_for, goals_against, goal_diff, form)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (league_id, team_id, season) DO UPDATE SET
              rank = EXCLUDED.rank, points = EXCLUDED.points, played = EXCLUDED.played,
              won = EXCLUDED.won, drawn = EXCLUDED.drawn, lost = EXCLUDED.lost,
              goals_for = EXCLUDED.goals_for, goals_against = EXCLUDED.goals_against,
              goal_diff = EXCLUDED.goal_diff, form = EXCLUDED.form
          `, [leagueId, teamId, new Date().getFullYear(), row.position || row.rank, row.points, row.playedGames || row.all?.played, row.won || row.all?.win, row.draw || row.all?.draw, row.lost || row.all?.lose, row.goalsFor || row.all?.goals?.for, row.goalsAgainst || row.all?.goals?.against, row.goalDifference || row.goalsDiff, row.form || '']);
        }
      }
      console.log('✅ First-run seeding complete.');
    } else {
      rows.forEach(r => leagueMap[r.code] = r.id);
      console.log(`✅ DB already seeded (${rows.length} leagues). Skipping API seed calls.`);
    }
  } catch (err) {
    console.error('Error seeding initial data:', err.message);
  }
}

// ─── START SERVER ───────────────────────────────────────────────────
async function startServer() {
  try {
    await initDb();
    // Initialize model versioning (seeds v1.0 if needed)
    const { getActiveVersion } = await import('./engine/modelVersioning.js');
    const activeModel = await getActiveVersion();
    console.log(`  Active model: ${activeModel.version} (weights: ${JSON.stringify(activeModel.weights)})`);
    // Initialize calibration curves
    const { initCalibration } = await import('./engine/calibrationLayer.js');
    await initCalibration();
    
    // Precompute demo predictions and prime the cache for <1s load times
    const { precomputeDemoPredictions } = await import('./services/demoEngine.js');
    await precomputeDemoPredictions();
    
    await seedInitialData();
  } catch (dbErr) {
    console.error('⚠️  Database init failed — running without DB:', dbErr.message);
    console.error('   App will use API-based data + demo fallback.');
  }
  try {
    initJobs();
  } catch (jobErr) {
    console.error('⚠️  Job scheduler init failed:', jobErr.message);
  }
  
  server.listen(port, () => {
    console.log('==========================================');
    console.log("  Oddyessa Backend — RUNNING");
    console.log(`  http://localhost:${port}`);
    console.log('==========================================');
  });

  // Keep the instance warm so the first visitor of the day doesn't hit a cold
  // start (Render spins idle instances down). Self-ping /health every ~12 min.
  if (process.env.NODE_ENV === 'production') {
    const SELF = (process.env.RENDER_EXTERNAL_URL || 'https://troys-footy-iq-api.onrender.com').replace(/\/+$/, '');
    const keepWarm = setInterval(() => { fetch(`${SELF}/health`).catch(() => {}); }, 12 * 60 * 1000);
    if (keepWarm.unref) keepWarm.unref();
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
async function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] Received ${signal} — shutting down gracefully...`);
  try {
    const { closeDb } = await import('./db/index.js');
    await closeDb();
    console.log('[SHUTDOWN] Database connections closed.');
  } catch (err) {
    console.error('[SHUTDOWN] Error during cleanup:', err.message);
  }
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
