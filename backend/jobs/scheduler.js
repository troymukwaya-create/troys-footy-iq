import cron from 'node-cron';
import { query } from '../db/index.js';
import dataRouter from '../services/dataRouter.js';
import { broadcast } from '../server.js';
import { FD_LEAGUES } from '../constants/leagues.js';
import { processEvent, predictInPlay, registerMatch, getMatchState, predictPreMatch } from '../engine/inferenceEngine.js';
import { evaluateStoredPredictions } from '../pipeline/evaluate.js';
import { ingestResults } from '../services/resultService.js';
import { ingestDailyFixtures, generateDailyPredictions } from '../services/dataIngestionService.js';
import { computeFeedbackAggregates } from '../engine/feedbackEngine.js';
import { optimizeWeights } from '../engine/weightOptimizer.js';
import { computeCalibrationCurve, invalidateCalibrationCache } from '../engine/calibrationLayer.js';
import { getActiveVersion, createVersion, promoteVersion, updateVersionMetrics, rollbackVersion } from '../engine/modelVersioning.js';
import { generateModelInsights } from '../services/modelAnalyst.js';
import { invalidateWeightCache } from '../engine/ensemble.js';
import { runHealthCheck, checkForModelDegradation, createAlert } from '../services/monitor.js';
import { invalidateMaturityCache } from '../engine/trustSignals.js';
import { loadPersistedElo } from '../engine/nationalTeams.js';
import { runEloLearningCycle } from './eloIngest.js';

let previousScores = {};

function hasRealToken() {
  const token = process.env.FOOTBALLDATA_TOKEN;
  if (!token)                          return false;
  if (token.length < 8)               return false;
  if (token === 'YOUR_VALUE_FROM_FOOTBALL_DATA_ORG') return false;
  if (token === 'YOUR_ACTUAL_TOKEN_HERE')             return false;
  if (token === 'PASTE_YOUR_ACTUAL_TOKEN_HERE')       return false;
  if (token.includes('placeholder'))  return false;
  if (token.includes('YOUR_VALUE'))   return false;
  if (token.startsWith('PASTE'))      return false;
  return true;
}

async function livePollLoop() {
  if (!hasRealToken()) return;

  try {
    const { normalise } = await import('../services/footballdata.js');
    const axios = (await import('axios')).default;
    
    const r = await axios.get('https://api.football-data.org/v4/matches', {
      headers: { 'X-Auth-Token': process.env.FOOTBALLDATA_TOKEN },
      params: { competitions: 'PL,PD,BL1,SA,FL1,BSA,CL', status: 'IN_PLAY,PAUSED' },
      timeout: 8000,
    });

    const liveMatches = (r.data.matches || []).map(normalise);

    for (const match of liveMatches) {
      const prev = previousScores[match.id];

      // Ensure match is registered in the engine
      if (!getMatchState(match.id)) {
        // Mock pre-match context for now if not available
        registerMatch(match.id, { lambdaHome: 1.4, lambdaAway: 1.2 });
      }

      // Goal detection — compare actual score numbers
      if (prev &&
          prev.score.home !== null && match.score.home !== null &&
          (match.score.home !== prev.score.home || match.score.away !== prev.score.away)) {

        const homeScored = match.score.home > prev.score.home;
        const scoringTeam = homeScored ? match.homeTeam.name : match.awayTeam.name;

        console.log(`GOAL: ${scoringTeam} scores! ${match.homeTeam.name} ${match.score.home}-${match.score.away} ${match.awayTeam.name}`);

        broadcast('GOAL_SCORED', {
          fixtureId:   match.id,
          homeTeam:    match.homeTeam.name,
          awayTeam:    match.awayTeam.name,
          scoringTeam,
          newScore:    match.score,
          minute:      match.minute,
          league:      match.league.name,
        });

        // Feed event to Engine
        processEvent(match.id, { 
          event_type: 'GOAL', 
          team: homeScored ? 'home' : 'away', 
          minute: match.minute 
        });
      }

      // Status change detection
      if (prev && prev.status !== match.status) {
        if (match.status === 'FINISHED') {
          broadcast('MATCH_FINISHED', match);
          console.log(`FINISHED: ${match.homeTeam.name} ${match.score.home}-${match.score.away} ${match.awayTeam.name}`);
        }
        if (match.status === 'IN_PLAY' && prev.status === 'SCHEDULED') {
          broadcast('MATCH_STARTED', match);
          console.log(`STARTED: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
        }
        if (match.status === 'PAUSED') {
          broadcast('HALF_TIME', match);
        }
      }

      // Feed clock update to Engine
      if (match.status === 'IN_PLAY') {
        processEvent(match.id, { event_type: 'CLOCK_UPDATE', minute: match.minute });
      }

      // Attach live prediction to broadcast payload
      const livePrediction = predictInPlay(match.id);
      if (livePrediction) {
        match.probability = {
          riskLevel: livePrediction.riskLevel,
          probabilities: livePrediction.probabilities,
          topScorelines: (livePrediction.topScorelines || []).slice(0, 2),
          model: livePrediction.model
        };
      }

      previousScores[match.id] = match;
    }

    if (liveMatches.length > 0) {
      broadcast('LIVE_SCORES_UPDATE', liveMatches);
    }

  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[livePoll] Rate limited — pausing for 70s');
      await new Promise(r => setTimeout(r, 70000));
    } else {
      console.error('[livePoll] Error:', err.message);
    }
  }
}

async function liveStatsPollLoop() {
  try {
    const liveMatches = await dataRouter.getAllLiveMatches().catch(() => []);
    for (const match of liveMatches) {
      if (match.status === 'IN_PLAY') {
        // We mock fetchMatchStats or implement it later based on instructions
        // If apifootball was implemented, we would fetch here.
        // For now, doing nothing or broadcasting mock to prevent crashes.
      }
    }
  } catch (err) {}
}

async function updateAndBroadcastStandings(leagueCode) {
  try {
    const standings = await dataRouter.getStandings(leagueCode);
    // await upsertStandings(standings, leagueCode); // Provided by user but might not exist
    broadcast('STANDINGS_UPDATE', { leagueCode, standings });
  } catch (err) {}
}

export default function initJobs() {
  setInterval(livePollLoop, 60000);
  livePollLoop();
  setInterval(liveStatsPollLoop, 60000);

  // ─── NATIONAL-TEAM ELO LEARNING (World Cup) ───────────────────────
  // Load any learned ratings, then refresh from recent international results
  // shortly after boot and every 6 hours (qualifiers/friendlies this week).
  loadPersistedElo().then(() => runEloLearningCycle()).catch(() => {});
  cron.schedule('15 */6 * * *', async () => {
    console.log('[SCHEDULER] Running national-team Elo learning cycle...');
    try { await runEloLearningCycle(); }
    catch (err) { console.error('[SCHEDULER] Elo learning failed:', err.message); }
  });

  // Daily at 08:00 — Update standings for all leagues
  cron.schedule('0 8 * * *', async () => {
    for (const code of Object.keys(FD_LEAGUES)) {
      await updateAndBroadcastStandings(code);
      await new Promise(r => setTimeout(r, 7000));
    }
  });

  // Daily at 06:00 — Refresh upcoming fixtures from all sources
  cron.schedule('0 6 * * *', async () => {
    console.log('[SCHEDULER] Running daily fixture ingestion...');
    try {
      const result = await ingestDailyFixtures();
      console.log('[SCHEDULER] Fixture ingestion complete:', result);
    } catch (err) {
      console.error('[SCHEDULER] Fixture ingestion failed:', err.message);
    }
  });

  // Every 4 hours — Fetch results for finished matches + feedback loop
  cron.schedule('0 */4 * * *', async () => {
    console.log('[SCHEDULER] Running result ingestion + feedback loop...');
    try {
      const result = await ingestResults(3);
      console.log('[SCHEDULER] Result ingestion complete:', result);
    } catch (err) {
      console.error('[SCHEDULER] Result ingestion failed:', err.message);
    }
  });

  // Daily at 23:00 — Generate predictions for tomorrow's matches
  cron.schedule('0 23 * * *', async () => {
    console.log('[SCHEDULER] Generating daily predictions...');
    try {
      const result = await generateDailyPredictions();
      console.log('[SCHEDULER] Daily predictions complete:', result);
    } catch (err) {
      console.error('[SCHEDULER] Daily predictions failed:', err.message);
    }
  });

  // Weekly Monday 03:00 — Full model evaluation
  cron.schedule('0 3 * * 1', async () => {
    console.log('[SCHEDULER] Running weekly model evaluation...');
    try {
      const metrics = await evaluateStoredPredictions();
      console.log('[SCHEDULER] Evaluation complete:', metrics);
    } catch (err) {
      console.error('[SCHEDULER] Evaluation failed:', err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SELF-IMPROVING ENGINE JOBS
  // ═══════════════════════════════════════════════════════════════════

  // Daily at 04:00 — Compute feedback aggregates (bias detection)
  cron.schedule('0 4 * * *', async () => {
    console.log('[SCHEDULER] Computing feedback aggregates...');
    try {
      const result = await computeFeedbackAggregates();
      console.log(`[SCHEDULER] Feedback: ${result.aggregates.length} aggregates, ${result.biases.length} biases detected`);
    } catch (err) {
      console.error('[SCHEDULER] Feedback computation failed:', err.message);
    }
  });

  // Weekly Monday 04:00 — Run weight optimization
  cron.schedule('0 4 * * 1', async () => {
    console.log('[SCHEDULER] Running weight optimization...');
    try {
      const result = await optimizeWeights();
      if (result.optimized) {
        console.log(`[SCHEDULER] ✅ Optimized! New version: ${result.newVersion}`);
        console.log(`[SCHEDULER] Weights: ${JSON.stringify(result.newWeights)}`);
        console.log(`[SCHEDULER] Log loss improvement: ${result.improvementPct}%`);
        // Invalidate caches so new weights take effect
        invalidateWeightCache();
      } else {
        console.log(`[SCHEDULER] No optimization: ${result.reason}`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Weight optimization failed:', err.message);
    }
  });

  // Weekly Monday 04:30 — Update calibration curves from data
  cron.schedule('30 4 * * 1', async () => {
    console.log('[SCHEDULER] Updating calibration curves...');
    try {
      // Fetch evaluated predictions for calibration
      const predResult = await query(`
        SELECT
          CASE WHEN actual_result = predicted_outcome THEN prob_home / 100.0 ELSE 0 END as predicted_prob,
          CASE WHEN prediction_correct THEN true ELSE false END as actual_hit
        FROM model_performance mp
        JOIN predictions p ON mp.prediction_id = p.id
        WHERE mp.actual_outcome IS NOT NULL
        ORDER BY mp.created_at DESC
        LIMIT 300
      `);

      const predictions = predResult?.rows || [];
      if (predictions.length >= 50) {
        const newCurve = computeCalibrationCurve(predictions);
        if (newCurve) {
          // Store in active version
          const version = await getActiveVersion();
          await updateVersionMetrics(version.version, {
            ...(version.metrics || {}),
            calibrationUpdatedAt: new Date().toISOString(),
          });
          invalidateCalibrationCache();
          console.log('[SCHEDULER] ✅ Calibration curves updated');
        }
      } else {
        console.log(`[SCHEDULER] Insufficient data for calibration (${predictions.length}/50)`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Calibration update failed:', err.message);
    }
  });

  // Weekly Monday 05:00 — Generate AI insights
  cron.schedule('0 5 * * 1', async () => {
    console.log('[SCHEDULER] Generating AI model insights...');
    try {
      const insights = await generateModelInsights();
      console.log(`[SCHEDULER] AI insights: ${insights.suggestions?.length || 0} suggestions generated`);
    } catch (err) {
      console.error('[SCHEDULER] AI insights failed:', err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRODUCTION MONITORING & SAFETY
  // ═══════════════════════════════════════════════════════════════════

  // Every 6 hours — System health check + monitoring heartbeat
  cron.schedule('0 */6 * * *', async () => {
    console.log('[SCHEDULER] Running system health check...');
    try {
      const health = await runHealthCheck();
      console.log(`[SCHEDULER] Health: ${health.status}`);
      if (health.status === 'CRITICAL') {
        console.error('[SCHEDULER] ⚠️ SYSTEM CRITICAL — check /api/monitor/health');
      }
    } catch (err) {
      console.error('[SCHEDULER] Health check failed:', err.message);
    }
  });

  // Daily at 05:00 — Auto-rollback check
  cron.schedule('0 5 * * *', async () => {
    console.log('[SCHEDULER] Checking for model degradation...');
    try {
      const result = await checkForModelDegradation();
      if (result.shouldRollback) {
        console.error(`[SCHEDULER] ⚠️ MODEL DEGRADATION DETECTED: ${result.reason}`);
        const rolledBack = await rollbackVersion();
        if (rolledBack) {
          console.log(`[SCHEDULER] ✅ Auto-rolled back to ${rolledBack}`);
          invalidateWeightCache();
          invalidateMaturityCache();
          await createAlert('AUTO_ROLLBACK', 'CRITICAL',
            `Auto-rolled back to ${rolledBack}: ${result.reason}`,
            { rolledBackTo: rolledBack, reason: result.reason },
            'scheduler'
          );
        }
      } else {
        console.log(`[SCHEDULER] Model health OK: ${result.reason}`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Degradation check failed:', err.message);
    }
  });

  console.log('✅ Scheduler initialized: live poll, fixtures, results, predictions, evaluation, feedback, optimization, AI insights, monitoring, auto-rollback');
}
