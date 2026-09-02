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

import { registerClientCounter } from './services/runtimeStats.js';
import { hasGithubToken, getLastDispatch } from './services/githubDispatch.js';
import { getSignalFlags } from './services/wcForm.js';
import app, { ensureReady } from './app.js';
import { registerBroadcastSink } from './services/broadcast.js';

const port = process.env.PORT || 3001;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

registerClientCounter(() => clients.size);

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'INIT', payload: { liveMatches: [], fixtures: [] } }));
});

registerBroadcastSink((type, payload) => {
  const message = JSON.stringify({ type, payload });
  clients.forEach((ws) => { if (ws.readyState === 1) ws.send(message); });
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
    await ensureReady();

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
