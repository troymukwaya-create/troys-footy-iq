// ─── ANALYSIS ROUTE ─────────────────────────────────────────────────
// GET /api/analysis/:matchId
// Pipeline: Fetch normalized data → Run probability engine → AI analysis
// Returns structured analysis with probability, risk, and AI insights.

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
import { normalizeTeamStats, normalizeH2H, errorResponse } from '../services/normalizer.js';
import { computeExpectedGoals, generateProbabilities, analyzeMatch } from '../services/probabilityEngine.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// ─── GET /api/analysis/:matchId ─────────────────────────────────────
router.get('/:matchId', async (req, res) => {
  const { matchId } = req.params;

  if (!matchId) {
    return res.status(400).json(errorResponse('Match ID is required'));
  }

  // Check cache first (24h TTL)
  const cacheKey = `full_analysis_${matchId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[analysis] Cache HIT for ${matchId}`);
    return res.json(cached);
  }

  try {
    console.log(`[analysis] Building analysis for ${matchId}...`);

    // 1. Determine source and fetch match data
    let match = null;
    let homeStats = null;
    let awayStats = null;
    let h2hData = null;

    if (matchId.startsWith('fd_')) {
      // Football-data.org source
      const cleanId = matchId.replace('fd_', '');
      match = await fd.getMatch(cleanId).catch(() => null);

      if (match) {
        const homeTeamId = parseInt(match.homeTeam.id.replace('fd_t_', ''));
        const awayTeamId = parseInt(match.awayTeam.id.replace('fd_t_', ''));
        const leagueCode = match.league?.code;

        // Fetch context data in parallel
        const [h2hRaw, homeMatches, awayMatches, standings] = await Promise.all([
          fd.getH2H(cleanId, 8).catch(() => ({ matches: [] })),
          fd.getTeamMatches(homeTeamId, { status: 'FINISHED', limit: 10 }).catch(() => ({ matches: [] })),
          fd.getTeamMatches(awayTeamId, { status: 'FINISHED', limit: 10 }).catch(() => ({ matches: [] })),
          fd.getStandings(leagueCode).catch(() => ({ standings: [] })),
        ]);

        // Extract stats from standings
        const table = standings?.standings?.[0]?.table || [];
        const hPos = table.find(t => t.team.id === homeTeamId);
        const aPos = table.find(t => t.team.id === awayTeamId);

        homeStats = normalizeTeamStats(hPos ? {
          played: hPos.playedGames,
          goalsFor: hPos.goalsFor,
          goalsAgainst: hPos.goalsAgainst,
          wins: hPos.won,
          draws: hPos.draw,
          losses: hPos.lost,
          form: hPos.form || computeFormFromMatches(homeMatches.matches || [], homeTeamId),
        } : null);

        awayStats = normalizeTeamStats(aPos ? {
          played: aPos.playedGames,
          goalsFor: aPos.goalsFor,
          goalsAgainst: aPos.goalsAgainst,
          wins: aPos.won,
          draws: aPos.draw,
          losses: aPos.lost,
          form: aPos.form || computeFormFromMatches(awayMatches.matches || [], awayTeamId),
        } : null);

        h2hData = normalizeH2H(h2hRaw, match.homeTeam.name, match.awayTeam.name);
      }
    } else if (matchId.startsWith('apf_')) {
      // API-Sports source
      match = await api.getFixture(matchId).catch(() => null);

      if (match) {
        const numHomeId = match.homeTeam.id.replace('apf_t_', '');
        const numAwayId = match.awayTeam.id.replace('apf_t_', '');

        const [h2hRaw, predictions] = await Promise.all([
          api.getH2H(numHomeId, numAwayId).catch(() => []),
          api.getPredictions(matchId).catch(() => null),
        ]);

        homeStats = normalizeTeamStats(predictions?.comparison ? {
          goalsFor: parseFloat(predictions.goals?.home || '1.35') * 10,
          goalsAgainst: 12,
          played: 10,
        } : null);

        awayStats = normalizeTeamStats(predictions?.comparison ? {
          goalsFor: parseFloat(predictions.goals?.away || '1.15') * 10,
          goalsAgainst: 14,
          played: 10,
        } : null);

        h2hData = normalizeH2H(h2hRaw, match.homeTeam.name, match.awayTeam.name);
      }
    }

    if (!match) {
      return res.status(404).json(errorResponse('Match not found'));
    }

    // 2. Run probability engine
    const probabilityResult = analyzeMatch(homeStats, awayStats);

    // 3. Run AI analysis (non-blocking — fallback if it fails)
    let aiAnalysis = null;
    if (ANTHROPIC_KEY && ANTHROPIC_KEY.length > 20) {
      aiAnalysis = await getAIInsights(match, homeStats, awayStats, h2hData, probabilityResult).catch(err => {
        console.error('[analysis] AI error:', err.message);
        return null;
      });
    }

    // Build fallback AI if Claude fails
    if (!aiAnalysis) {
      aiAnalysis = buildFallbackAI(match, probabilityResult, homeStats, awayStats, h2hData);
    }

    // 4. Assemble response
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
      probability: probabilityResult,
      homeStats,
      awayStats,
      h2h: h2hData,
      ai: aiAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // 5. Cache result (24h)
    cacheService.set(cacheKey, result, 86400);

    res.json(result);
  } catch (err) {
    console.error(`[analysis] Error for ${matchId}:`, err.message);
    res.status(500).json(errorResponse('Analysis failed', err.message));
  }
});

// ─── HELPER: Compute form string from match results ─────────────────
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
${home}: Form ${homeStats.form} | Avg scored ${homeStats.avgGoalsFor} | Avg conceded ${homeStats.avgGoalsAgainst} | P${homeStats.played} W${homeStats.wins} D${homeStats.draws} L${homeStats.losses}
${away}: Form ${awayStats.form} | Avg scored ${awayStats.avgGoalsFor} | Avg conceded ${awayStats.avgGoalsAgainst} | P${awayStats.played} W${awayStats.wins} D${awayStats.draws} L${awayStats.losses}

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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key': ANTHROPIC_KEY,
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
      `${home} averaging ${homeStats.avgGoalsFor} goals/game, conceding ${homeStats.avgGoalsAgainst}`,
      `${away} averaging ${awayStats.avgGoalsFor} goals/game, conceding ${awayStats.avgGoalsAgainst}`,
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
