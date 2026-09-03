import axios from 'axios';
import { query } from '../db/index.js';
import { logApiCost } from './monitor.js';
import { CHAT_MODEL } from '../config/models.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function analyzeFixture(fixture) {
  // AI is off by default on the free stack (spec §4.3). Fail closed rather
  // than firing an unauthenticated request at Anthropic on every match view.
  if (!process.env.ANTHROPIC_API_KEY || process.env.NARRATIVE_POLISH === 'off') {
    return null;
  }
  try {
    const homeRes = await query(`SELECT * FROM team_season_stats WHERE team_id = $1`, [fixture.home_team_id]);
    const awayRes = await query(`SELECT * FROM team_season_stats WHERE team_id = $1`, [fixture.away_team_id]);
    const homeStats = homeRes.rows[0] || {};
    const awayStats = awayRes.rows[0] || {};

    const h2hRes = await query(`
      SELECT * FROM fixtures 
      WHERE status = 'FINISHED' 
      AND ((home_team_id = $1 AND away_team_id = $2) OR (home_team_id = $2 AND away_team_id = $1))
      ORDER BY match_date DESC LIMIT 8
    `, [fixture.home_team_id, fixture.away_team_id]);
    const h2hHistory = h2hRes.rows;

    const prompt = `
Match: Home vs Away
Date: ${fixture.match_date}

Home Team Stats: W/D/L: ${homeStats.wins||0}/${homeStats.draws||0}/${homeStats.losses||0}, Goals For/Against: ${homeStats.goals_for||0}/${homeStats.goals_against||0}, BTTS count: ${homeStats.btts_count||0}, Over 2.5 count: ${homeStats.over25_count||0}, Form: ${homeStats.form||'N/A'}
Away Team Stats: W/D/L: ${awayStats.wins||0}/${awayStats.draws||0}/${awayStats.losses||0}, Goals For/Against: ${awayStats.goals_for||0}/${awayStats.goals_against||0}, BTTS count: ${awayStats.btts_count||0}, Over 2.5 count: ${awayStats.over25_count||0}, Form: ${awayStats.form||'N/A'}

H2H Analysis (Last 8 meetings):
${h2hHistory.map(h => `Score: Home ${h.home_goals} - Away ${h.away_goals}`).join('\\n')}

Return ONLY a valid JSON object with no markdown fences, no html, no other text. Keys required:
"pick" (string), "confidence" (number 0-100), "risk_score" (number 0-100), "risk_level" (string: Low, Medium, High), "reasoning" (string: 2-3 sentences), "key_risks" (array of strings),
"insights" (array of 3 objects with "title" and "body" strings),
"win_probability" (object with "home", "draw", "away" integer percentages that sum to 100).
Only recommend picks with risk_score below 35. If none suitable, set confidence to 0.
Supported pick types: Over 2.5 Goals, Under 2.5 Goals, BTTS Yes, BTTS No, Home Win, Away Win, Double Chance 1X, Double Chance X2, Draw.
`;

    const response = await axios.post(ANTHROPIC_API_URL, {
      model: CHAT_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    // Cost accounting for the CEO dashboard spend card (fire-and-forget).
    try {
      logApiCost(response.data?.usage, CHAT_MODEL, 'ai_verdict');
    } catch { /* never let accounting break analysis */ }

    const outputText = response.data?.content?.[0]?.text || '{}';
    const cleanOutput = outputText.replace(/^\\s*\\`\\`\\`[a-z]*\\n?/im, '').replace(/\\n?\\`\\`\\`\\s*$/im, '');

    return JSON.parse(cleanOutput);
  } catch (error) {
    console.error('Error analyzing fixture:', error.message);
    return null;
  }
}

export default { analyzeFixture };
