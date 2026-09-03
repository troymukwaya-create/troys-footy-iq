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
const THE_ODDS_KEY = process.env.THE_ODDS_API_KEY || '';
const DB_URL = process.env.DATABASE_URL || '';

function isValidKey(key, minLen = 10) {
  return key && key.length >= minLen
    && !key.startsWith('YOUR') && !key.startsWith('PASTE')
    && !key.includes('placeholder') && !key.startsWith('API_KEY');
}

console.log(`  APISPORTS_KEY:     ${isValidKey(APISPORTS_KEY) ? 'YES (' + APISPORTS_KEY.slice(0,4) + '****)' : 'NO'}`);
console.log(`  FOOTBALLDATA_TOKEN: ${isValidKey(FD_TOKEN) ? 'YES (' + FD_TOKEN.slice(0,4) + '****)' : 'NO'}`);
console.log(`  ANTHROPIC_API_KEY: ${isValidKey(CLAUDE_KEY, 20) ? 'YES' : 'NO'}`);
console.log(`  THE_ODDS_API_KEY:  ${isValidKey(THE_ODDS_KEY) ? 'YES (' + THE_ODDS_KEY.slice(0,4) + '****)' : 'NO — market blend DISABLED, predictions run Elo-only'}`);
console.log(`  DATABASE_URL:      ${DB_URL ? 'YES' : 'NO'}`);
console.log('==========================================');

if (!isValidKey(APISPORTS_KEY) && !isValidKey(FD_TOKEN)) {
  console.warn('⚠️  No API keys configured — app will use demo data.');
  console.warn('   Set APISPORTS_KEY or FOOTBALLDATA_TOKEN in backend/.env');
}

import express from 'express';
import cors from 'cors';

// Crash protection — log errors instead of dying
process.on('uncaughtException',  err => console.error('[CRASH PREVENTED]', err.message));
process.on('unhandledRejection', err => console.error('[PROMISE REJECTION]', err?.message || err));

import { initDb, query, isDbAvailable, getDbError } from './db/index.js';
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
import { hasGithubToken, getLastDispatch } from './services/githubDispatch.js';
import { getSignalFlags } from './services/wcForm.js';

const app = express();

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
const READY_EXEMPT = new Set(['/health', '/api/health']);
app.use(async (req, _res, next) => {
  if (!READY_EXEMPT.has(req.path)) await ensureReady();
  next();
});

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
  const hasTheOdds = isValidKey(THE_ODDS_KEY);

  const warnings = [];
  if (!hasDb)     warnings.push('DATABASE_URL not set — predictions will not be persisted');
  if (!hasApi && !hasFd) warnings.push('No data API keys set — demo mode active');
  if (!hasClaude) warnings.push('ANTHROPIC_API_KEY not set — AI analysis disabled');
  if (!hasTheOdds) warnings.push('THE_ODDS_API_KEY not set — market blend disabled, predictions run Elo-only');

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
      hasTheOdds:     !!hasTheOdds,        // The Odds API (market blend) configured?
      hasGithubToken: hasGithubToken(),   // heartbeat armed? (boolean, never the token)
      nodeEnv:        process.env.NODE_ENV || 'development',
    },
    // Engine signal flags (suspensions / xG-form / stakes) + last heartbeat
    // dispatch outcome — so the social heartbeat is verifiable without logs.
    engine: { signals: getSignalFlags() },
    socialHeartbeat: { armed: hasGithubToken(), last: getLastDispatch() },
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

// ─── LAZY BOOTSTRAP ─────────────────────────────────────────────────
// Serverless has no startup hook, so init runs on the first request of an
// instance and is memoized for the rest of its life. Deliberately excludes
// seedInitialData() and precomputeDemoPredictions() — both are expensive and
// seeding spends football-data.org quota. Those remain in server.js.
const BOOTSTRAP_RETRY_MS = 30_000;
let readyPromise = null;
let lastFailureAt = 0;

async function bootstrap() {
  await initDb();
  const { getActiveVersion } = await import('./engine/modelVersioning.js');
  await getActiveVersion();
  const { initCalibration } = await import('./engine/calibrationLayer.js');
  await initCalibration();
}

export function ensureReady() {
  if (readyPromise) return readyPromise;
  // After a failure, serve requests immediately for a cooldown window rather
  // than re-paying the DB connect timeout on every single request.
  if (Date.now() - lastFailureAt < BOOTSTRAP_RETRY_MS) return Promise.resolve();
  readyPromise = bootstrap().catch((err) => {
    console.error('[app] bootstrap failed:', err.message);
    lastFailureAt = Date.now();
    readyPromise = null;   // let a later request retry, after the cooldown
  });
  return readyPromise;
}

export default app;

