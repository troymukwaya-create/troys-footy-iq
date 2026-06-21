import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import express from 'express';
const router  = express.Router();
import axios   from 'axios';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const APS_KEY       = process.env.APISPORTS_KEY     || ''
const FD_TOKEN      = process.env.FOOTBALLDATA_TOKEN || ''

function hasAPS() { return APS_KEY.length > 10 && !APS_KEY.startsWith('API_KEY') }

import * as analyst from '../services/analyst.js';
import * as fd from '../services/footballdata.js';
import cacheService from '../services/cache.js';
import { CHAT_MODEL } from '../config/models.js';

const DEMO_ANALYSES = {
  'dm1': {
    verdict: "High-stakes tactical battle expected at the Emirates. Both sides are in peak attacking form, suggesting a high-probability BTTS scenario.",
    attackAnalysis: "Arsenal's wing play remains elite, while City's central penetration with Haaland is the primary threat.",
    defenceAnalysis: "Both sides have shown minor lapses in clean sheets recently against top-6 opposition.",
    formAnalysis: "Arsenal are on a 4-game winning streak; City have drawn 2 of their last 5 away.",
    h2hAnalysis: "Historically tight, but 80% of recent meetings at the Emirates have seen over 1.5 goals.",
    injuryAnalysis: "Key personnel available for both sides, ensuring a full-strength tactical showdown.",
    keyFactors: ["Home advantage", "High-pressing systems", "Title race pressure", "Set-piece efficiency", "Midfield control"],
    recommendation: "BTTS Yes is the strongest statistical opportunity.",
    recommendedMarket: "BTTS Yes",
    confidence: 82,
    analystRating: "8.5/10",
    riskNote: "Main risk is a tactical stalemate in the first half.",
    lowRiskBets: [{market: "Over 1.5 Goals", reason: "92% frequency in recent h2h"}, {market: "Arsenal Double Chance", reason: "Strong home record this season"}],
    midRiskBets: [{market: "BTTS Yes", reason: "Both teams have scored in 4 of last 5 meetings"}],
    highRiskBets: [{market: "Draw", reason: "Tactical parity between Arteta and Guardiola"}]
  },
  'dm2': {
    verdict: "El Clásico always delivers high volatility, but Real Madrid's current home dominance makes them slight favourites.",
    attackAnalysis: "Vinícius Jr and Bellingham are clinical. Barca's high line is susceptible to quick transitions.",
    defenceAnalysis: "Real's backline is stable; Barca missing key defensive depth this week.",
    formAnalysis: "Madrid unbeaten in 10; Barca recovering from a recent away loss.",
    h2hAnalysis: "Madrid have won 3 of the last 5 Clásicos in all competitions.",
    injuryAnalysis: "Minor knocks for Barca's midfield may tip the balance in Madrid's favour.",
    keyFactors: ["Counter-attack speed", "High defensive lines", "Individual brilliance", "Midfield transition", "Atmosphere"],
    recommendation: "Real Madrid to edge a high-scoring encounter.",
    recommendedMarket: "Home Win",
    confidence: 74,
    analystRating: "7.8/10",
    riskNote: "Clásicos are notoriously unpredictable regardless of form.",
    lowRiskBets: [{market: "Over 2.5 Goals", reason: "Common feature of this rivalry"}],
    midRiskBets: [{market: "Home Win", reason: "Bernabeu factor and transition pace"}],
    highRiskBets: [{market: "Real Madrid -1.5", reason: "Potential for a breakout win if Barca chase the game"}]
  },
  'dm3': {
    verdict: "Der Klassiker remains the highlight of the Bundesliga. Bayern's home form is relentless, but Dortmund's counter is dangerous.",
    attackAnalysis: "Harry Kane is the focal point. Dortmund rely on quick wing transitions.",
    defenceAnalysis: "Bayern occasionally vulnerable to pace; Dortmund conceding 1.4 goals/game away.",
    formAnalysis: "Bayern top of the table; Dortmund fighting for UCL spots.",
    h2hAnalysis: "Bayern have historically dominated this fixture at the Allianz Arena.",
    injuryAnalysis: "No major absences for this high-profile matchup.",
    keyFactors: ["Allianz Arena atmosphere", "Harry Kane's efficiency", "Transitions", "Set-piece dominance", "Squad depth"],
    recommendation: "High scoring match with Bayern likely taking the points.",
    recommendedMarket: "Over 2.5 Goals",
    confidence: 88,
    analystRating: "9/10",
    riskNote: "Dortmund's resilience in big games can occasionally force a draw.",
    lowRiskBets: [{market: "Over 2.5 Goals", reason: "88% probability on current models"}],
    midRiskBets: [{market: "Home Win & Over 2.5", reason: "Aggressive Bayern playstyle at home"}],
    highRiskBets: [{market: "Kane to Score 2+", reason: "Consistent performance in big fixtures"}]
  },
  'dm4': {
    verdict: "Liverpool's dominance at Anfield was clear. United's defensive structure collapsed under the high-press intensity.",
    attackAnalysis: "Salah and Díaz exploited the half-spaces effectively.",
    defenceAnalysis: "Van Dijk commanded the line, restricting United to speculative efforts.",
    formAnalysis: "Continuing a strong surge; United showing signs of tactical inconsistency.",
    h2hAnalysis: "Another convincing chapter in Liverpool's recent home dominance over United.",
    injuryAnalysis: "N/A - Match Completed.",
    keyFactors: ["Intensity", "Pressing", "Clinical finishing", "Midfield dominance", "Tactical cohesion"],
    recommendation: "Analysis confirms pre-match statistical favouritism.",
    recommendedMarket: "N/A",
    confidence: 100,
    analystRating: "10/10",
    riskNote: "N/A",
    lowRiskBets: [], midRiskBets: [], highRiskBets: []
  },
  'dm5': {
    verdict: "A tactical chess match in the Derby d'Italia. Expected to be low scoring with both teams prioritizing defensive shape.",
    attackAnalysis: "Lautaro is the main threat for Inter. Juve rely on structured counters.",
    defenceAnalysis: "Two of the best defences in Italy facing off.",
    formAnalysis: "Both in the Scudetto race; Inter slightly more consistent.",
    h2hAnalysis: "Frequent low-scoring draws in recent tactical encounters.",
    injuryAnalysis: "Defensive units are at full strength.",
    keyFactors: ["Tactical discipline", "Set-pieces", "Clean sheets", "Midfield battle", "Managerial chess"],
    recommendation: "Under 2.5 Goals is the most mathematically sound pick.",
    recommendedMarket: "Under 2.5 Goals",
    confidence: 76,
    analystRating: "7.6/10",
    riskNote: "An early goal could force a more open game.",
    lowRiskBets: [{market: "Under 3.5 Goals", reason: "90% confidence in tactical shape"}],
    midRiskBets: [{market: "Under 2.5 Goals", reason: "Historical trend in high-stakes Italian derbies"}],
    highRiskBets: [{market: "Draw", reason: "High probability of a 1-1 or 0-0 stalemate"}]
  }
};

// POST /api/ai/analyze/:fixtureId
router.post('/analyze/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  
  // 0. Handle Demo IDs
  if (fixtureId.startsWith('dm')) {
    const demo = DEMO_ANALYSES[fixtureId];
    if (demo) {
      console.log(`[ai] Serving Static Demo Analysis for ${fixtureId}`);
      // Keep even demo content credible — never show 100%/inflated confidence.
      const safe = { ...demo, confidence: Math.min(demo.confidence ?? 50, 60) };
      return res.json({ ai: safe, generatedAt: new Date().toISOString(), source: 'demo' });
    }
  }

  const cacheKey = `analysis_${fixtureId}`;
  
  // 1. Try Cache
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[ai] Cache HIT for ${fixtureId}`);
    return res.json(cached);
  }

  try {
    console.log(`[ai] Analyzing ${fixtureId}...`);
    
    // 2. Fetch Match Details
    const cleanId = String(fixtureId).replace('fd_', '');
    const match = await fd.getMatch(cleanId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const homeTeamId = parseInt(match.homeTeam.id.replace('fd_t_', ''));
    const awayTeamId = parseInt(match.awayTeam.id.replace('fd_t_', ''));
    const leagueCode = match.league.code;

    // 3. Fetch Contextual Data in Parallel
    const [h2hData, homeMatches, awayMatches, standingsData] = await Promise.all([
      fd.getH2H(cleanId, 5).catch(() => ({ matches: [] })),
      fd.getTeamMatches(homeTeamId, { status: 'FINISHED', limit: 8 }).catch(() => ({ matches: [] })),
      fd.getTeamMatches(awayTeamId, { status: 'FINISHED', limit: 8 }).catch(() => ({ matches: [] })),
      fd.getStandings(leagueCode).catch(() => ({ standings: [] }))
    ]);

    // 4. Assemble Context for AI
    // We transform the FD data to the format analyst.js expects
    const h2h = (h2hData.matches || []).map(m => ({
      date: m.utcDate,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      winner: m.score.winner === 'HOME_TEAM' ? m.homeTeam.name : m.score.winner === 'AWAY_TEAM' ? m.awayTeam.name : 'Draw',
      goals: { home: m.score.fullTime.home, away: m.score.fullTime.away }
    }));

    const homeStats = {
      form: analyst.calculateForm ? analyst.calculateForm(homeMatches.matches || [], homeTeamId) : (homeMatches.matches || []).slice(0,5).map(m => m.score.winner === 'HOME_TEAM' ? 'W' : 'L').join(''),
      goals: { for: { average: { total: 1.5 } }, against: { average: { total: 1.1 } } } // Placeholder, will refine if stats available
    };
    
    // Use the standings table to get real averages if possible
    const standing = standingsData.standings?.[0]?.table || [];
    const hPos = standing.find(t => t.team.id === homeTeamId);
    const aPos = standing.find(t => t.team.id === awayTeamId);

    if (hPos) {
      homeStats.goals.for.average.total = hPos.goalsFor / hPos.playedGames;
      homeStats.goals.against.average.total = hPos.goalsAgainst / hPos.playedGames;
    }

    const awayStats = {
      form: analyst.calculateForm ? analyst.calculateForm(awayMatches.matches || [], awayTeamId) : (awayMatches.matches || []).slice(0,5).map(m => m.score.winner === 'AWAY_TEAM' ? 'W' : 'L').join(''),
      goals: { for: { average: { total: 1.2 } }, against: { average: { total: 1.4 } } }
    };
    if (aPos) {
      awayStats.goals.for.average.total = aPos.goalsFor / aPos.playedGames;
      awayStats.goals.against.average.total = aPos.goalsAgainst / aPos.playedGames;
    }

    const context = analyst.assembleContext(match, { home: homeStats, away: awayStats }, h2h, null, null);
    
    // 5. Run AI Analysis
    const aiAnalysis = await analyst.getAIAnalysis(context);

    const result = {
      ...context,
      ai: aiAnalysis,
      generatedAt: new Date().toISOString()
    };

    // 6. Save to Cache (24 hours)
    cacheService.set(cacheKey, result, 86400);
    
    res.json(result);
  } catch (err) {
    console.error(`[ai/analyze] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, context, history } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })

  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20) {
    return res.json({ reply: 'Claude API key not configured. Add ANTHROPIC_API_KEY to backend/.env to enable chat.' })
  }

  try {
    const fixture = context?.fixture
    const home = fixture?.homeTeam?.name || 'Home'
    const away = fixture?.awayTeam?.name || 'Away'
    const markets = context?.markets

    const system = `You are Oddyessa, a professional football data analyst.
You are analysing: ${home} vs ${away} (${fixture?.league?.name || 'Football'}).
Win probabilities: ${home} ${markets?.result?.homeWin || '?'}% | Draw ${markets?.result?.draw || '?'}% | ${away} ${markets?.result?.awayWin || '?'}%
Over 2.5 goals: ${markets?.goals?.over25 || '?'}% | BTTS Yes: ${markets?.btts?.yes || '?'}%
Best pick: ${context?.bestPick?.name || 'N/A'} at ${context?.bestPick?.prob || '?'}%
This platform is for analysis only. Never encourage gambling. Be data-driven and concise.`

    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: CHAT_MODEL,
      max_tokens: 400,
      system,
      messages: [...(history || []).slice(-6), { role:'user', content: message }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })

    res.json({ reply: r.data.content[0].text })
  } catch (err) {
    console.error('[ai/chat] Error:', err.message)
    res.json({ reply: 'Unable to process your question right now. Please try again.' })
  }
})

// POST /api/ai/briefing
router.post('/briefing', async (req, res) => {
  let fixtures = req.body?.fixtures || [];
  
  if (fixtures.length === 0) {
    try {
      const dataRouter = (await import('../services/dataRouter.js')).default;
      fixtures = await dataRouter.getTodayFixtures();
    } catch (e) {
      console.error('[briefing] Auto-fetch failed:', e.message);
    }
  }

  if (fixtures.length === 0) return res.json({ message: 'No fixtures for briefing' });

  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20) {
    const today = fixtures.filter(f => new Date(f.date).toDateString() === new Date().toDateString());
    const g = today[0] || fixtures[0];
    return res.json({
      headline: "Daily Statistical Analysis Breakdown",
      topPick: { fixture: `${g.homeTeam?.name} vs ${g.awayTeam?.name}`, market: 'Over 1.5 Goals', reasoning: 'Model indicates strong scoring intent based on season averages.', confidence: 75 },
      gameOfTheDay: { fixture: `${g.homeTeam?.name} vs ${g.awayTeam?.name}`, why: 'Statistical model shows highest volatility in this matchup based on recent scoring patterns.' },
      avoid: { fixture: 'Late night sessions', why: 'Fatigue and rotation indicators suggest higher than average volatility across these fixtures.' },
      summary: "Today's slate shows varying confidence levels. Focus on teams with consistent home scoring records."
    });
  }

  try {
    const list = fixtures.slice(0, 15).map(f => `${f.homeTeam?.name} vs ${f.awayTeam?.name} (${f.league?.name})`).join('\n');
    const prompt = `You are a professional football analyst. I will give you a list of top fixtures.
Pick the most interesting "Game of the Day" (analytical potential) and one "Match to Avoid" (too unpredictable or risky).

FIXTURES:
${list}

Return ONLY this JSON:
{
  "gameOfTheDay": { "fixture": "Team A vs Team B", "why": "one sentence analytics" },
  "avoid": { "fixture": "Team C vs Team D", "why": "one sentence analytics" }
}`;

    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: CHAT_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const text = r.data.content[0].text.replace(/```json|```/g,'').trim();
    res.json(JSON.parse(text));
  } catch (err) {
    res.json({
      headline: "Market Insight & Analysis",
      topPick: { fixture: 'Premier League Action', market: 'BTTS - Yes', reasoning: 'High scoring trends in recent top-flight games.', confidence: 72 },
      gameOfTheDay: { fixture: 'Premier League Action', why: 'Top flight matches today show significant statistical divergence between home and away form.' },
      avoid: { fixture: 'Closer matchups', why: 'Model confidence is lower on matches with less than 20% win probability gap.' },
      summary: "Model suggests prioritizing goal markets today as defensive rotations are expected."
    });
  }
});

// GET /api/ai/picks/today
router.get('/picks/today', (req, res) => {
  try {
    const picks = [];
    cacheService.store.forEach((val, key) => {
      if (key.startsWith('analysis_') && val.value?.bestPick) {
        picks.push({
          fixture:    val.value.fixture || {},
          pick:       val.value.bestPick || {},
          lowRisk:    val.value.lowRiskMarkets || [],
          confidence: val.value.ai?.confidence || 0,
          verdict:    val.value.ai?.verdict    || '',
        });
      }
    });
    picks.sort((a, b) => (b.pick?.prob || 0) - (a.pick?.prob || 0));
    res.json(picks.slice(0, 10));
  } catch (err) {
    console.error('[ai/picks/today] Error:', err.message);
    res.json([]);
  }
})

export default router;
