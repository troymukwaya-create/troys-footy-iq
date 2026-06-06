// ─── ANALYSIS ROUTE ─────────────────────────────────────────────────
// GET /api/analysis/:matchId
// Pipeline: Fetch → Validate → Predict (only if ready) → AI → Respond
//
// CRITICAL: Predictions are NEVER computed on incomplete data.
// The response includes a `dataQuality` field so the frontend
// knows whether to render predictions or show a loading/error state.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
import axios from 'axios';
const router = express.Router();

import * as fd from '../services/footballdata.js';
import api from '../services/apisports.js';
import cacheService from '../services/cache.js';
import {
  normalizeTeamStats,
  normalizeH2H,
  validateStatsForPrediction,
  errorResponse,
} from '../services/normalizer.js';
import { computeExpectedGoals, generateProbabilities, analyzeMatch } from '../services/probabilityEngine.js';
import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import oddsService from '../services/oddsService.js';
import { impliedProbs } from '../services/sources/theOddsApi.js';
import { computePreMatchFeatures } from '../engine/preMatchFeatures.js';
import { storePrediction } from '../services/predictionService.js';
import { safeQuery } from '../db/index.js';

// Read at request time (not module-load) so dotenv override in server.js
// takes effect. ESM imports hoist before server.js's dotenv runs.
const getAnthropicKey = () => process.env.ANTHROPIC_API_KEY || '';

// ─── GET /api/analysis/:matchId ─────────────────────────────────────
router.get('/:matchId', async (req, res) => {
  const { matchId } = req.params;

  if (!matchId) {
    return res.status(400).json(errorResponse('Match ID is required'));
  }

  // Check cache first (only valid analyses are cached)
  const cacheKey = `full_analysis_v2_${matchId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[analysis] Cache HIT for ${matchId} (quality: ${cached.dataQuality})`);
    return res.json(cached);
  }

  try {
    console.log(`[analysis] Building analysis for ${matchId}...`);

    // ─── STEP 1: Fetch match + raw data ────────────────────────
    let match = null;
    let rawHomeStats = null;
    let rawAwayStats = null;
    let h2hData = null;
    let fetchErrors = [];

    if (matchId.startsWith('fd_')) {
      const cleanId = matchId.replace('fd_', '');
      match = await fd.getMatch(cleanId).catch(err => {
        fetchErrors.push(`Match fetch failed: ${err.message}`);
        return null;
      });

      if (match) {
        // Lifecycle State Check
        if (match.status === 'FINISHED' || match.status === 'FT') {
          return res.json({
            status: 'FINISHED',
            result: { home: match.score?.home, away: match.score?.away }
          });
        }
        if (match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'LIVE') {
          return res.json({
            status: 'LIVE',
            liveStats: null // FD doesn't support live stats
          });
        }

        const homeTeamId = parseInt(match.homeTeam.id.replace('fd_t_', ''));
        const awayTeamId = parseInt(match.awayTeam.id.replace('fd_t_', ''));
        const leagueCode = match.league?.code;

        // Fetch context data in parallel — track individual failures
        const [h2hRaw, homeMatches, awayMatches, standings] = await Promise.all([
          fd.getH2H(cleanId, 8).catch(err => { fetchErrors.push(`H2H: ${err.message}`); return { matches: [] }; }),
          fd.getTeamMatches(homeTeamId, { status: 'FINISHED', limit: 10 }).catch(err => { fetchErrors.push(`Home matches: ${err.message}`); return { matches: [] }; }),
          fd.getTeamMatches(awayTeamId, { status: 'FINISHED', limit: 10 }).catch(err => { fetchErrors.push(`Away matches: ${err.message}`); return { matches: [] }; }),
          fd.getStandings(leagueCode).catch(err => { fetchErrors.push(`Standings: ${err.message}`); return { standings: [] }; }),
        ]);

        // Extract stats from standings
        const table = standings?.standings?.[0]?.table || [];
        const hPos = table.find(t => t.team.id === homeTeamId);
        const aPos = table.find(t => t.team.id === awayTeamId);

        if (hPos) {
          rawHomeStats = {
            played: hPos.playedGames,
            goalsFor: hPos.goalsFor,
            goalsAgainst: hPos.goalsAgainst,
            wins: hPos.won,
            draws: hPos.draw,
            losses: hPos.lost,
            form: hPos.form || computeFormFromMatches(homeMatches.matches || [], homeTeamId),
          };
        } else {
          fetchErrors.push('Home team not found in standings');
        }

        if (aPos) {
          rawAwayStats = {
            played: aPos.playedGames,
            goalsFor: aPos.goalsFor,
            goalsAgainst: aPos.goalsAgainst,
            wins: aPos.won,
            draws: aPos.draw,
            losses: aPos.lost,
            form: aPos.form || computeFormFromMatches(awayMatches.matches || [], awayTeamId),
          };
        } else {
          fetchErrors.push('Away team not found in standings');
        }

        h2hData = normalizeH2H(h2hRaw, match.homeTeam.name, match.awayTeam.name);
      }
    } else if (matchId.startsWith('apf_')) {
      match = await api.getFixture(matchId).catch(err => {
        fetchErrors.push(`APF fixture fetch failed: ${err.message}`);
        return null;
      });

      if (match) {
        // Lifecycle State Check
        if (match.status === 'FINISHED' || match.status === 'FT') {
          return res.json({
            status: 'FINISHED',
            result: { home: match.score?.home, away: match.score?.away }
          });
        }
        if (match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'LIVE') {
          const liveStats = await api.getFixtureStats(matchId).catch(err => {
            console.error(`[analysis] APF live stats failed: ${err.message}`);
            return null;
          });
          return res.json({
            status: 'LIVE',
            liveStats
          });
        }

        const numHomeId = match.homeTeam.id.replace('apf_t_', '');
        const numAwayId = match.awayTeam.id.replace('apf_t_', '');

        const [h2hRaw, predictions] = await Promise.all([
          api.getH2H(numHomeId, numAwayId).catch(err => { fetchErrors.push(`APF H2H: ${err.message}`); return []; }),
          api.getPredictions(matchId).catch(err => { fetchErrors.push(`APF predictions: ${err.message}`); return null; }),
        ]);

        // Extract real stats from predictions if available
        if (predictions?.teams?.home?.league) {
          const hl = predictions.teams.home.league;
          rawHomeStats = {
            played: hl.fixtures?.played?.total || 0,
            goalsFor: hl.goals?.for?.total?.total || 0,
            goalsAgainst: hl.goals?.against?.total?.total || 0,
            wins: hl.fixtures?.wins?.total || 0,
            draws: hl.fixtures?.draws?.total || 0,
            losses: hl.fixtures?.loses?.total || 0,
            form: hl.form || 'N/A',
          };
        } else if (predictions?.comparison) {
          // Fallback: extract what we can from comparison data
          const homeGoalsStr = predictions.goals?.home || '';
          const awayGoalsStr = predictions.goals?.away || '';
          const homeGoalsParsed = parseFloat(homeGoalsStr);
          const awayGoalsParsed = parseFloat(awayGoalsStr);

          if (!isNaN(homeGoalsParsed) && !isNaN(awayGoalsParsed)) {
            rawHomeStats = {
              played: 10,
              goalsFor: Math.round(homeGoalsParsed * 10),
              goalsAgainst: Math.round(awayGoalsParsed * 10),
              wins: 0, draws: 0, losses: 0,
              form: 'N/A',
            };
            rawAwayStats = {
              played: 10,
              goalsFor: Math.round(awayGoalsParsed * 10),
              goalsAgainst: Math.round(homeGoalsParsed * 10),
              wins: 0, draws: 0, losses: 0,
              form: 'N/A',
            };
          } else {
            fetchErrors.push('APF predictions data unparseable');
          }
        } else {
          fetchErrors.push('APF predictions returned no usable data');
        }

        if (predictions?.teams?.away?.league) {
          const al = predictions.teams.away.league;
          rawAwayStats = {
            played: al.fixtures?.played?.total || 0,
            goalsFor: al.goals?.for?.total?.total || 0,
            goalsAgainst: al.goals?.against?.total?.total || 0,
            wins: al.fixtures?.wins?.total || 0,
            draws: al.fixtures?.draws?.total || 0,
            losses: al.fixtures?.loses?.total || 0,
            form: al.form || 'N/A',
          };
        }

        h2hData = normalizeH2H(h2hRaw, match.homeTeam.name, match.awayTeam.name);
      }
    }

    if (!match) {
      return res.status(404).json(errorResponse('Match not found'));
    }

    // ─── STEP 2: Normalize stats ────────────────────────────────
    const homeStats = normalizeTeamStats(rawHomeStats);
    const awayStats = normalizeTeamStats(rawAwayStats);

    // ─── STEP 3: Validate data readiness ────────────────────────
    const validation = validateStatsForPrediction(homeStats, awayStats);

    // Log inputs for debugging
    console.log(`[analysis] ${matchId} data validation:`, {
      homeValid: homeStats.isValid,
      awayValid: awayStats.isValid,
      homePlayed: homeStats.played,
      awayPlayed: awayStats.played,
      homeAvgGF: homeStats.avgGoalsFor,
      awayAvgGF: awayStats.avgGoalsFor,
      validationPassed: validation.valid,
      issues: validation.issues,
      fetchErrors: fetchErrors.length > 0 ? fetchErrors : 'none',
    });

    // ─── STEP 4: Determine data quality ─────────────────────────
    let dataQuality; // COMPLETE | PARTIAL | INSUFFICIENT
    let probabilityResult = null;

    if (match.league?.code === 'WC') {
      // World Cup: national teams have no league stats — predict from Elo strength,
      // blended with bookmaker odds (The Odds API) where available.
      dataQuality = 'COMPLETE';
      let marketProbs = null;
      try {
        const odds = await oddsService.getFixtureOdds(matchId, { home: match.homeTeam?.name, away: match.awayTeam?.name });
        marketProbs = impliedProbs(odds);
      } catch (e) { /* odds are optional */ }
      probabilityResult = predictWorldCupMatch(match.homeTeam?.name, match.awayTeam?.name, marketProbs);
      console.log(`[analysis] ${matchId} World Cup prediction (market-blended: ${!!marketProbs})`);
    } else if (validation.valid) {
      // Full data available — run predictions
      dataQuality = 'COMPLETE';
      probabilityResult = await analyzeMatch(homeStats, awayStats);
    } else if (homeStats.isValid || awayStats.isValid) {
      // One team has data — run with caution flag
      dataQuality = 'PARTIAL';
      probabilityResult = await analyzeMatch(homeStats, awayStats);
      console.warn(`[analysis] ${matchId} running with PARTIAL data: ${validation.issues.join(', ')}`);
    } else {
      // No usable data — do NOT predict
      dataQuality = 'INSUFFICIENT';
      console.warn(`[analysis] ${matchId} SKIPPING prediction: ${validation.issues.join(', ')}`);
    }

    // ─── STEP 4b: Log prediction for continuous learning ────────
    if (probabilityResult && match.status !== 'FINISHED') {
      try {
        const features = computePreMatchFeatures(homeStats, awayStats, {
          h2h: h2hData || emptyH2H(),
        });
        // Fire-and-forget — don't block the response, but log errors
        storePrediction({
          matchExternalId: matchId,
          homeTeam: match.homeTeam?.name,
          awayTeam: match.awayTeam?.name,
          prediction: probabilityResult,
          odds: null,
          valueEdges: null,
          features,
        }).catch(err => {
          console.error(`[analysis] Prediction storage failed for ${matchId}:`, err.message);
        });
      } catch (logErr) {
        // Non-critical: prediction logging should never break analysis
      }
    }

    // ─── STEP 5: AI cache check ONLY (never block on Claude) ─────
    // The main /analysis route returns model predictions FAST. If Claude
    // analysis happens to be cached we attach it; otherwise the frontend
    // calls /analysis/:id/ai separately and renders progressively.
    let aiAnalysis = null;
    const anthropicKey = getAnthropicKey();
    if (dataQuality !== 'INSUFFICIENT' && anthropicKey && anthropicKey.length > 20) {
      try {
        const cachedAI = await safeQuery(
          `SELECT analysis FROM ai_analysis_cache
           WHERE fixture_id = $1 AND created_at > NOW() - INTERVAL '6 hours'
           ORDER BY created_at DESC LIMIT 1`,
          [matchId]
        );
        if (cachedAI?.rows?.[0]?.analysis) {
          console.log(`[analysis] AI cache HIT for ${matchId} (inline)`);
          aiAnalysis = cachedAI.rows[0].analysis;
        }
      } catch (cacheErr) {
        console.error('[analysis] AI cache check failed:', cacheErr.message);
      }
    }

    // Build fallback AI if Claude unavailable / not yet cached
    if (!aiAnalysis && probabilityResult) {
      aiAnalysis = buildFallbackAI(match, probabilityResult, homeStats, awayStats, h2hData || emptyH2H());
    }

    // ─── STEP 6: Assemble response ──────────────────────────────
    const result = {
      match: {
        id: match.id,
        date: match.date,
        venue: match.venue || '',
        status: match.status,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        score: match.score,
        league: match.league,
      },
      // Data quality flag — frontend uses this to decide what to render
      dataQuality,
      dataIssues: validation.valid ? [] : validation.issues,
      // Only include probability if data is sufficient
      probability: probabilityResult,
      homeStats: homeStats.isValid ? homeStats : null,
      awayStats: awayStats.isValid ? awayStats : null,
      h2h: h2hData || emptyH2H(),
      ai: aiAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // ─── STEP 7: Cache ONLY complete/partial analyses ───────────
    if (dataQuality === 'COMPLETE') {
      cacheService.set(cacheKey, result, 86400); // 24h
    } else if (dataQuality === 'PARTIAL') {
      cacheService.set(cacheKey, result, 1800); // 30 min — allow retry
    }
    // INSUFFICIENT data is NEVER cached

    res.json(result);
  } catch (err) {
    console.error(`[analysis] Error for ${matchId}:`, err.message);
    res.status(500).json(errorResponse('Analysis failed', err.message));
  }
});

// ─── GET /api/analysis/:matchId/ai ─────────────────────────────────
// Returns Claude analysis only. Cache-first (6h TTL). On miss, calls
// Claude (5-30s). Frontend loads this in parallel with the main route
// so model predictions render immediately while AI streams in after.
router.get('/:matchId/ai', async (req, res) => {
  const { matchId } = req.params;
  if (!matchId) {
    return res.status(400).json(errorResponse('Match ID is required'));
  }

  const anthropicKey = getAnthropicKey();
  if (!anthropicKey || anthropicKey.length <= 20) {
    return res.json({ ai: null, source: 'disabled' });
  }

  // 1. DB cache check (instant)
  try {
    const cached = await safeQuery(
      `SELECT analysis FROM ai_analysis_cache
       WHERE fixture_id = $1 AND created_at > NOW() - INTERVAL '6 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [matchId]
    );
    if (cached?.rows?.[0]?.analysis) {
      console.log(`[analysis/ai] cache HIT for ${matchId}`);
      return res.json({ ai: cached.rows[0].analysis, source: 'cache' });
    }
  } catch (cacheErr) {
    console.error('[analysis/ai] cache check failed:', cacheErr.message);
  }

  // 2. Cache miss — need the full analysis context to call Claude.
  // Reuse the main cached analysis if available (avoids refetching FD data).
  const baseAnalysis = cacheService.get(`full_analysis_v2_${matchId}`);
  if (!baseAnalysis || !baseAnalysis.probability) {
    return res.json({
      ai: null,
      source: 'no-base',
      message: 'Call /api/analysis/:matchId first to compute base predictions.',
    });
  }

  try {
    const ai = await getAIInsights(
      baseAnalysis.match,
      baseAnalysis.homeStats || { isValid: false },
      baseAnalysis.awayStats || { isValid: false },
      baseAnalysis.h2h || emptyH2H(),
      baseAnalysis.probability
    );

    if (ai) {
      // Store result
      safeQuery(
        `INSERT INTO ai_analysis_cache (fixture_id, analysis) VALUES ($1, $2)`,
        [matchId, JSON.stringify(ai)]
      ).catch(err => console.error('[analysis/ai] cache store failed:', err.message));

      // Refresh main cache so future /analysis hits get AI attached
      baseAnalysis.ai = ai;
      cacheService.set(`full_analysis_v2_${matchId}`, baseAnalysis, 86400);

      console.log(`[analysis/ai] computed + cached for ${matchId}`);
      return res.json({ ai, source: 'fresh' });
    }

    return res.json({ ai: null, source: 'claude-error' });
  } catch (err) {
    console.error(`[analysis/ai] error for ${matchId}:`, err.message);
    return res.status(500).json(errorResponse('AI analysis failed', err.message));
  }
});

// ─── HELPERS ────────────────────────────────────────────────────────

function emptyH2H() {
  return { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0, avgGoals: 0, matches: [] };
}

function computeFormFromMatches(matches, teamId) {
  if (!matches || matches.length === 0) return 'N/A';
  return matches.slice(0, 5).map(m => {
    const isHome = m.homeTeam?.id === teamId || m.homeTeam?.id === `fd_t_${teamId}`;
    const hGoals = m.score?.fullTime?.home ?? 0;
    const aGoals = m.score?.fullTime?.away ?? 0;
    if (isHome) {
      return hGoals > aGoals ? 'W' : hGoals < aGoals ? 'L' : 'D';
    } else {
      return aGoals > hGoals ? 'W' : aGoals < hGoals ? 'L' : 'D';
    }
  }).join('');
}

// ─── AI ANALYSIS via Claude ─────────────────────────────────────────
async function getAIInsights(match, homeStats, awayStats, h2h, prob) {
  const home = match.homeTeam?.name || 'Home';
  const away = match.awayTeam?.name || 'Away';

  const prompt = `Act as a professional football analyst. Analyze this match using the data provided.

MATCH: ${home} vs ${away}
LEAGUE: ${match.league?.name || 'Unknown'}
DATE: ${match.date || 'TBD'}
VENUE: ${match.venue || 'Unknown'}

POISSON MODEL OUTPUT:
- Win probabilities: ${home} ${prob.probabilities.home}% | Draw ${prob.probabilities.draw}% | ${away} ${prob.probabilities.away}%
- Expected goals: ${home} ${prob.expectedGoals.home} | ${away} ${prob.expectedGoals.away} | Total ${prob.expectedGoals.total}
- Most likely scoreline: ${prob.topScorelines?.[0]?.score || 'N/A'} (${prob.topScorelines?.[0]?.probability || 0}%)
- Over 2.5 Goals: ${prob.overUnder.over25}% | Under 2.5: ${prob.overUnder.under25}%
- BTTS Yes: ${prob.btts.yes}% | BTTS No: ${prob.btts.no}%
- Risk Level: ${prob.riskLevel}

TEAM STATS:
${home}: Form ${homeStats?.form || 'N/A'} | Avg scored ${homeStats?.avgGoalsFor || 'N/A'} | Avg conceded ${homeStats?.avgGoalsAgainst || 'N/A'} | P${homeStats?.played || 0} W${homeStats?.wins || 0} D${homeStats?.draws || 0} L${homeStats?.losses || 0}
${away}: Form ${awayStats?.form || 'N/A'} | Avg scored ${awayStats?.avgGoalsFor || 'N/A'} | Avg conceded ${awayStats?.avgGoalsAgainst || 'N/A'} | P${awayStats?.played || 0} W${awayStats?.wins || 0} D${awayStats?.draws || 0} L${awayStats?.losses || 0}

H2H (last ${h2h.totalMatches} meetings):
${home} wins: ${h2h.homeWins} | Draws: ${h2h.draws} | ${away} wins: ${h2h.awayWins} | Avg goals: ${h2h.avgGoals}

Explain concisely and be data-driven. Return ONLY this JSON (no markdown fences):
{
  "verdict": "2-3 sentence overall match verdict",
  "keyInsights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "tacticalExpectation": "1-2 sentences on how the match will likely play out",
  "riskReasoning": "1 sentence explaining why this risk level is appropriate",
  "recommendedPick": "Best value market name",
  "confidence": 75,
  "matchPattern": "e.g. 'Low-scoring tactical battle' or 'High-tempo attacking match'"
}`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key': getAnthropicKey(),
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    timeout: 25000,
  });

  const text = (response.data?.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ─── FALLBACK AI (when Claude is unavailable) ───────────────────────
function buildFallbackAI(match, prob, homeStats, awayStats, h2h) {
  const home = match.homeTeam?.name || 'Home';
  const away = match.awayTeam?.name || 'Away';
  const bestPick = prob.bestPick;

  return {
    verdict: `Statistical model gives ${home} a ${prob.probabilities.home}% win probability vs ${away} at ${prob.probabilities.away}%. ${prob.overUnder.over25 > 55 ? `Over 2.5 goals is favoured at ${prob.overUnder.over25}%.` : 'A tight, low-scoring match is expected.'}`,
    keyInsights: [
      homeStats?.isValid ? `${home} averaging ${homeStats.avgGoalsFor} goals/game, conceding ${homeStats.avgGoalsAgainst}` : `${home}: stats unavailable`,
      awayStats?.isValid ? `${away} averaging ${awayStats.avgGoalsFor} goals/game, conceding ${awayStats.avgGoalsAgainst}` : `${away}: stats unavailable`,
      h2h.totalMatches > 0 ? `H2H: ${h2h.homeWins}W ${h2h.draws}D ${h2h.awayWins}L in last ${h2h.totalMatches} meetings` : 'No H2H data available',
      `Most likely scoreline: ${prob.topScorelines?.[0]?.score || 'N/A'}`,
    ],
    tacticalExpectation: prob.expectedGoals.total > 2.8
      ? 'An open, attacking match is expected based on both teams\' scoring rates.'
      : 'A tighter, more controlled match with fewer goals is expected.',
    riskReasoning: `Max outcome probability is ${Math.max(prob.probabilities.home, prob.probabilities.draw, prob.probabilities.away)}%, classifying this as ${prob.riskLevel} risk.`,
    recommendedPick: bestPick?.name || 'N/A',
    confidence: Math.round(bestPick?.probability || 50),
    matchPattern: prob.expectedGoals.total > 3.0 ? 'High-tempo attacking match'
      : prob.expectedGoals.total > 2.2 ? 'Balanced contest with goals expected'
      : 'Low-scoring tactical battle',
  };
}

export default router;
