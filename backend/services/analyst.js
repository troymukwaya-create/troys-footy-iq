import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
import axios from 'axios';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ─── POISSON PROBABILITY ENGINE ────────────────────────────────────

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateMarkets(homeLambda, awayLambda) {
  const MAX = 8;
  let homeWin = 0, draw = 0, awayWin = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0;
  let bttsYes = 0;
  const matrix = [];

  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poisson(h, homeLambda) * poisson(a, awayLambda);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      const total = h + a;
      if (total > 0.5) over05 += p;
      if (total > 1.5) over15 += p;
      if (total > 2.5) over25 += p;
      if (total > 3.5) over35 += p;
      if (total > 4.5) over45 += p;
      if (h > 0 && a > 0) bttsYes += p;
      if (h <= 4 && a <= 4) {
        matrix.push({ h, a, prob: parseFloat((p * 100).toFixed(1)) });
      }
    }
  }

  matrix.sort((a, b) => b.prob - a.prob);

  return {
    result: {
      homeWin: parseFloat((homeWin * 100).toFixed(1)),
      draw:    parseFloat((draw    * 100).toFixed(1)),
      awayWin: parseFloat((awayWin * 100).toFixed(1)),
    },
    goals: {
      over05: parseFloat((over05 * 100).toFixed(1)),
      over15: parseFloat((over15 * 100).toFixed(1)),
      over25: parseFloat((over25 * 100).toFixed(1)),
      over35: parseFloat((over35 * 100).toFixed(1)),
      over45: parseFloat((over45 * 100).toFixed(1)),
      under25: parseFloat(((1 - over25) * 100).toFixed(1)),
      under35: parseFloat(((1 - over35) * 100).toFixed(1)),
    },
    btts: {
      yes: parseFloat((bttsYes * 100).toFixed(1)),
      no:  parseFloat(((1 - bttsYes) * 100).toFixed(1)),
    },
    scoreline: matrix.slice(0, 12),
    topScoreline: matrix[0],
  };
}

// ─── RISK CLASSIFIER ───────────────────────────────────────────────

function classifyRisk(probability) {
  if (probability >= 70) return { level: 'LOW',    color: '#22C55E', emoji: '🟢', label: 'Low Risk'    };
  if (probability >= 55) return { level: 'MEDIUM', color: '#F59E0B', emoji: '🟡', label: 'Medium Risk' };
  if (probability >= 40) return { level: 'HIGH',   color: '#EF4444', emoji: '🔴', label: 'High Risk'   };
  return                         { level: 'VERY HIGH', color: '#991B1B', emoji: '⚫', label: 'Very High Risk' };
}

function buildRiskedMarkets(markets) {
  const all = [
    { name: 'Home Win',      prob: markets.result.homeWin,  category: '1X2'     },
    { name: 'Draw',          prob: markets.result.draw,     category: '1X2'     },
    { name: 'Away Win',      prob: markets.result.awayWin,  category: '1X2'     },
    { name: 'Over 0.5 Goals',prob: markets.goals.over05,   category: 'Goals'   },
    { name: 'Over 1.5 Goals',prob: markets.goals.over15,   category: 'Goals'   },
    { name: 'Over 2.5 Goals',prob: markets.goals.over25,   category: 'Goals'   },
    { name: 'Under 2.5 Goals',prob: markets.goals.under25, category: 'Goals'   },
    { name: 'Over 3.5 Goals',prob: markets.goals.over35,   category: 'Goals'   },
    { name: 'Under 3.5 Goals',prob: markets.goals.under35, category: 'Goals'   },
    { name: 'BTTS Yes',      prob: markets.btts.yes,       category: 'BTTS'    },
    { name: 'BTTS No',       prob: markets.btts.no,        category: 'BTTS'    },
  ];

  return all
    .map(m => ({ ...m, risk: classifyRisk(m.prob) }))
    .sort((a, b) => b.prob - a.prob);
}

// ─── DATA ASSEMBLER ────────────────────────────────────────────────

function safeGoalAvg(stats, side, venue) {
  if (!stats) return side === 'for' ? 1.35 : 1.15;
  const paths = [
    stats.goals?.[side]?.average?.[venue],
    stats.goals?.[side]?.average?.total,
    stats.goals?.[side]?.total?.[venue],
  ];
  for (const v of paths) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return side === 'for' ? 1.35 : 1.15;
}

function assembleContext(fixture, teamStats, h2h, predictions, injuries) {
  const home = fixture.homeTeam.name;
  const away = fixture.awayTeam.name;

  // Extract key stats
  const homeStats = teamStats?.home || {};
  const awayStats = teamStats?.away || {};

  const homeForm = homeStats.form || 'N/A';
  const awayForm = awayStats.form || 'N/A';

  // Average goals from stats using safer extractor
  const hAvgFor = safeGoalAvg(homeStats, 'for', 'home');
  const hAvgAg  = safeGoalAvg(homeStats, 'against', 'home');
  const aAvgFor = safeGoalAvg(awayStats, 'for', 'away');
  const aAvgAg  = safeGoalAvg(awayStats, 'against', 'away');

  // Lambda values for Poisson
  // We use Attacking Strength * Opponent Defensive Weakness
  let lambdaHome = hAvgFor * (aAvgAg / 1.15);
  let lambdaAway = aAvgFor * (hAvgAg / 1.15);

  // Override with predictions if available
  if (predictions?.comparison?.goals?.home && predictions?.comparison?.goals?.away) {
    const pHome = parseFloat(predictions.comparison.goals.home);
    const pAway = parseFloat(predictions.comparison.goals.away);
    if (!isNaN(pHome) && !isNaN(pAway)) {
      lambdaHome = (lambdaHome * 0.4) + (pHome * 0.6);
      lambdaAway = (lambdaAway * 0.4) + (pAway * 0.6);
    }
  }

  // Final clamping to ensure realistic numbers
  lambdaHome = Math.max(0.4, Math.min(3.5, lambdaHome || 1.4));
  lambdaAway = Math.max(0.4, Math.min(3.5, lambdaAway || 1.1));

  const markets = calculateMarkets(lambdaHome, lambdaAway);
  const riskedMarkets = buildRiskedMarkets(markets);
  const lowRiskMarkets  = riskedMarkets.filter(m => m.risk.level === 'LOW');
  const bestPick        = riskedMarkets[0];

  // H2H summary
  const h2hMatches  = h2h || [];
  const h2hHomeWins = h2hMatches.filter(m => m.winner === home).length;
  const h2hDraws    = h2hMatches.filter(m => m.winner === 'Draw').length;
  const h2hAwayWins = h2hMatches.filter(m => m.winner === away).length;
  const h2hGoals    = h2hMatches.length > 0
    ? (h2hMatches.reduce((sum, m) => sum + (m.goals?.home || 0) + (m.goals?.away || 0), 0) / h2hMatches.length).toFixed(1)
    : 'N/A';

  // Injuries
  const homeInjuries = (injuries?.home || []).map(p => p.player?.name).join(', ') || 'None reported';
  const awayInjuries = (injuries?.away || []).map(p => p.player?.name).join(', ') || 'None reported';

  return {
    fixture, markets, riskedMarkets, lowRiskMarkets, bestPick,
    lambdaHome: lambdaHome.toFixed(2),
    lambdaAway: lambdaAway.toFixed(2),
    homeStats: { form: homeForm, avgFor: hAvgFor.toFixed(2), avgAg: hAvgAg.toFixed(2) },
    awayStats: { form: awayForm, avgFor: aAvgFor.toFixed(2), avgAg: aAvgAg.toFixed(2) },
    h2h: { homeWins: h2hHomeWins, draws: h2hDraws, awayWins: h2hAwayWins, avgGoals: h2hGoals, last5: h2hMatches.slice(0,5) },
    injuries: { home: homeInjuries, away: awayInjuries },
    predictions: predictions || null,
  };
}

// ─── CLAUDE ANALYST CALL ───────────────────────────────────────────

async function getAIAnalysis(context) {
  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20) {
    return {
      verdict: 'Claude API key not configured. Add ANTHROPIC_API_KEY to backend/.env to enable AI analysis.',
      attackAnalysis: '', defenceAnalysis: '', formAnalysis: '',
      h2hAnalysis: '', injuryAnalysis: '', keyFactors: [], recommendation: '',
      confidence: 0, analystRating: 'N/A',
    };
  }

  const c = context;
  const home = c.fixture.homeTeam.name;
  const away = c.fixture.awayTeam.name;

  const prompt = `You are a professional football data analyst. Analyse this upcoming match and provide a detailed structured report.

MATCH: ${home} vs ${away}
LEAGUE: ${c.fixture.league.name}
DATE: ${new Date(c.fixture.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
VENUE: ${c.fixture.venue || 'Unknown'}

STATISTICAL MODEL OUTPUT:
Expected goals (lambda): ${home}=${c.lambdaHome} | ${away}=${c.lambdaAway}
Win probabilities: ${home} ${c.markets.result.homeWin}% | Draw ${c.markets.result.draw}% | ${away} ${c.markets.result.awayWin}%
Most likely scoreline: ${c.markets.topScoreline?.h}-${c.markets.topScoreline?.a} (${c.markets.topScoreline?.prob}%)
BTTS Yes: ${c.markets.btts.yes}% | No: ${c.markets.btts.no}%
Over 2.5 Goals: ${c.markets.goals.over25}% | Under 2.5: ${c.markets.goals.under25}%
Over 1.5 Goals: ${c.markets.goals.over15}%

TEAM FORM (last 5):
${home}: ${c.homeStats.form} | Avg goals scored: ${c.homeStats.avgFor} | Avg conceded: ${c.homeStats.avgAg}
${away}: ${c.awayStats.form} | Avg goals scored: ${c.awayStats.avgFor} | Avg conceded: ${c.awayStats.avgAg}

HEAD TO HEAD (last ${c.h2h.last5.length} meetings):
${home} wins: ${c.h2h.homeWins} | Draws: ${c.h2h.draws} | ${away} wins: ${c.h2h.awayWins}
Average goals per H2H match: ${c.h2h.avgGoals}

INJURIES & SUSPENSIONS:
${home}: ${c.injuries.home}
${away}: ${c.injuries.away}

LOW RISK OPPORTUNITIES (probability >= 70%):
${c.lowRiskMarkets.map(m => m.name + ' (' + m.prob + '%)').join(', ') || 'None above 70% threshold'}

BEST STATISTICAL PICK: ${c.bestPick?.name} (${c.bestPick?.prob}% probability)

Write a detailed analytical report. Be specific, data-driven, and honest about uncertainty.
Use a professional tone like a top sports analyst writing for a serious audience.

Return ONLY this JSON (no markdown, no explanation outside JSON):
{
  "verdict": "2-3 sentence overall match verdict - what exactly does the data and historical pattern say about this game?",
  "attackAnalysis": "2-3 sentences analysing attacking depth and recent conversion rates",
  "defenceAnalysis": "2-3 sentences analysing defensive stability and susceptibility to counter-attacks",
  "formAnalysis": "Analyse the momentum shift. Does current form contradict historical stats?",
  "h2hAnalysis": "Patterns in historical meetings (e.g. low scoring, home dominance)",
  "injuryAnalysis": "Impact of specific missing players on the tactical setup",
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4", "factor 5"],
  "recommendation": "Final data-backed conclusion",
  "recommendedMarket": "Specific market name",
  "confidence": 75,
  "analystRating": "8.5/10",
  "riskNote": "What is the primary variable that could invalidate this analysis?",
  "lowRiskBets": [{"market": "Market Name", "reason": "Data-driven reason"}],
  "midRiskBets": [{"market": "Market Name", "reason": "Data-driven reason"}],
  "highRiskBets": [{"market": "Market Name", "reason": "Data-driven reason"}]
}
`;

  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const text = res.data.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('[analyst] Claude error:', err.message);
    return {
      verdict: `Statistical model shows ${home} with ${c.markets.result.homeWin}% win probability. ${c.markets.goals.over25 > 55 ? 'Over 2.5 goals is favoured at ' + c.markets.goals.over25 + '%.' : 'A tight match is expected.'}`,
      attackAnalysis: `${home} averaging ${c.homeStats.avgFor} goals/game. ${away} averaging ${c.awayStats.avgFor} goals/game.`,
      defenceAnalysis: `${home} conceding ${c.homeStats.avgAg}/game. ${away} conceding ${c.awayStats.avgAg}/game.`,
      formAnalysis: `${home} form: ${c.homeStats.form}. ${away} form: ${c.awayStats.form}.`,
      h2hAnalysis: `Last ${c.h2h.last5.length} meetings: ${c.h2h.homeWins} wins ${c.h2h.draws} draws ${c.h2h.awayWins} wins. Avg ${c.h2h.avgGoals} goals.`,
      injuryAnalysis: `Injuries: ${home}: ${c.injuries.home}. ${away}: ${c.injuries.away}.`,
      keyFactors: ['Home advantage', 'Recent form', 'H2H record', 'Goal-scoring rates', 'Injury impact'],
      recommendation: c.bestPick ? `${c.bestPick.name} at ${c.bestPick.prob}% probability` : 'Insufficient data',
      recommendedMarket: c.bestPick?.name || 'N/A',
      confidence: Math.round(c.bestPick?.prob || 50),
      analystRating: '6/10',
      riskNote: 'Statistical models cannot account for in-game variables.',
    };
  }
}

// ─── DAILY BRIEFING ────────────────────────────────────────────────

async function getDailyBriefing(fixtures) {
  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20 || !fixtures?.length) return null;

  const upcoming = fixtures
    .filter(f => f.status === 'SCHEDULED' || f.status === 'IN_PLAY')
    .slice(0, 15);

  if (!upcoming.length) return null;

  const prompt = `You are a professional football analyst. Today's upcoming fixtures are:

${upcoming.map((f, i) =>
  (i+1) + '. ' + f.homeTeam.name + ' vs ' + f.awayTeam.name +
  ' (' + f.league.name + ') - ' +
  new Date(f.date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}) + ' UTC'
).join('\\n')}

Provide a concise daily analyst briefing. Focus on which games are most predictable (low risk) and which are unpredictable (high risk).

Return ONLY this JSON:
{
  "headline": "One sentence headline for today in football",
  "topPick": {
    "fixture": "Home vs Away",
    "market": "e.g. Over 1.5 Goals",
    "reasoning": "2 sentences why this is the standout low-risk opportunity today",
    "confidence": 78
  },
  "gameOfTheDay": {
    "fixture": "Home vs Away",
    "why": "2 sentences on why this is the most interesting analytical match today"
  },
  "avoid": {
    "fixture": "Home vs Away",
    "why": "2 sentences on why this match is unpredictable / high risk"
  },
  "summary": "2-3 sentence overall briefing on today's slate of games"
}`;

  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
    const text = res.data.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

// ─── AI CHAT ───────────────────────────────────────────────────────

async function chatAboutMatch(message, context, history) {
  if (!ANTHROPIC_KEY || ANTHROPIC_KEY.length < 20) {
    return 'Claude API key not configured. Add ANTHROPIC_API_KEY to backend/.env.';
  }

  const systemPrompt = `You are Troy's Footy IQ, an expert football data analyst.
You are currently analysing: ${context.fixture.homeTeam.name} vs ${context.fixture.awayTeam.name} (${context.fixture.league.name}).

Key statistics for this match:
- Win probabilities: ${context.fixture.homeTeam.name} ${context.markets?.result?.homeWin || '?'}% | Draw ${context.markets?.result?.draw || '?'}% | ${context.fixture.awayTeam.name} ${context.markets?.result?.awayWin || '?'}%
- Over 2.5 goals: ${context.markets?.goals?.over25 || '?'}%
- BTTS Yes: ${context.markets?.btts?.yes || '?'}%
- Best statistical pick: ${context.bestPick?.name || 'N/A'} at ${context.bestPick?.prob || '?'}%
- Low risk opportunities: ${context.lowRiskMarkets?.map(m => m.name + ' ' + m.prob + '%').join(', ') || 'None above 70%'}

You are an analyst only. You do NOT encourage gambling. You provide statistical analysis and data-driven insights.
Be direct, specific, and data-driven. Keep answers concise but thorough.`;

  const messages = [
    ...(history || []).slice(-8),
    { role: 'user', content: message },
  ];

  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
    return res.data.content[0].text;
  } catch (err) {
    return 'Analysis unavailable right now. Please try again.';
  }
}

export {
  calculateMarkets, classifyRisk, buildRiskedMarkets,
  assembleContext, getAIAnalysis, getDailyBriefing, chatAboutMatch,
};
