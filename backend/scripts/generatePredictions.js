import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import { normalizeTeamStats } from '../services/normalizer.js';
import { analyzeMatch } from '../services/probabilityEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const APISPORTS_KEY = process.env.APISPORTS_KEY;

if (!APISPORTS_KEY) {
  console.error("Missing APISPORTS_KEY");
  process.exit(1);
}

const client = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: {
    'x-apisports-key': APISPORTS_KEY
  },
  timeout: 15000
});

async function run() {
  try {
    console.log("Fetching standings...");
    let standingsRes, fixturesRes;
    let targetSeason = 2026;
    
    // Fallback logic to find the latest available season
    for (const season of [2026, 2025, 2024]) {
      try {
        const res = await client.get('/standings', { params: { league: 39, season } });
        if (res.data.response && res.data.response.length > 0) {
          standingsRes = res;
          targetSeason = season;
          console.log(`Found data for season ${season}`);
          break;
        }
      } catch(e) {}
    }

    const standingsData = standingsRes?.data?.response[0]?.league?.standings[0];
    
    if (!standingsData) {
      console.error("Could not fetch standings data for any recent season.");
      return;
    }

    const teamStatsMap = new Map();
    for (const teamInfo of standingsData) {
      const stats = normalizeTeamStats({
        played: teamInfo.all.played,
        goalsFor: teamInfo.all.goals.for,
        goalsAgainst: teamInfo.all.goals.against,
        wins: teamInfo.all.win,
        draws: teamInfo.all.draw,
        losses: teamInfo.all.lose,
        form: teamInfo.form
      });
      teamStatsMap.set(teamInfo.team.id, {
        name: teamInfo.team.name,
        stats
      });
    }

    console.log(`Fetching fixtures for ${targetSeason} season...`);
    fixturesRes = await client.get('/fixtures', { params: { league: 39, season: targetSeason } });
    const fixtures = fixturesRes.data.response || [];

    // Filter upcoming matches
    let upcoming = fixtures
      .filter(f => f.fixture.status.short === 'NS' || f.fixture.status.short === 'TBD')
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    // If there are no upcoming matches (e.g., season finished), we'll use the last 15 matches
    // of the season to demonstrate the prediction engine.
    if (upcoming.length === 0) {
      console.log("No scheduled future matches found. Using the final 15 matches of the season to demonstrate the prediction engine...");
      upcoming = fixtures
        .filter(f => f.fixture.status.short === 'FT' || f.fixture.status.short === 'PEN')
        .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date)) // Sort descending to get the last matches
        .slice(0, 15)
        .reverse(); // Reverse back to chronological order
    } else {
      console.log(`Found ${upcoming.length} upcoming matches.`);
    }

    // 3. Generate predictions for the next 15 upcoming matches
    const nextMatches = upcoming.slice(0, 15);
    const predictions = [];

    for (const match of nextMatches) {
      const homeTeam = teamStatsMap.get(match.teams.home.id);
      const awayTeam = teamStatsMap.get(match.teams.away.id);

      if (!homeTeam || !awayTeam) continue;

      const prob = await analyzeMatch(homeTeam.stats, awayTeam.stats);
      predictions.push({
        date: new Date(match.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        home: match.teams.home.name,
        away: match.teams.away.name,
        prob
      });
    }

    // 4. Generate Markdown Artifact
    let md = `# Premier League 2025/2026 — Upcoming Match Predictions\n\n`;
    md += `Based on the latest API-Football data, here are the probability predictions for the upcoming fixtures using the Poisson distribution engine we built.\n\n`;

    for (const p of predictions) {
      const bestPick = p.prob.bestPick;
      const riskEmoji = p.prob.riskLevel === 'LOW' ? '🟢' : p.prob.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
      
      md += `### ${p.home} vs ${p.away}\n`;
      md += `**Date:** ${p.date} | **Risk Level:** ${riskEmoji} ${p.prob.riskLevel}\n\n`;
      
      md += `**Win Probabilities:**\n`;
      md += `- ${p.home}: **${p.prob.probabilities.home}%**\n`;
      md += `- Draw: **${p.prob.probabilities.draw}%**\n`;
      md += `- ${p.away}: **${p.prob.probabilities.away}%**\n\n`;

      md += `**Expected Goals (xG):**\n`;
      md += `${p.home} **${p.prob.expectedGoals.home}** - **${p.prob.expectedGoals.away}** ${p.away} (Total: ${p.prob.expectedGoals.total})\n\n`;

      md += `**Key Markets:**\n`;
      md += `- Over 2.5 Goals: ${p.prob.overUnder.over25}%\n`;
      md += `- BTTS (Yes): ${p.prob.btts.yes}%\n`;
      md += `- Most Likely Score: ${p.prob.topScorelines[0].score} (${p.prob.topScorelines[0].probability}%)\n\n`;

      if (bestPick) {
        md += `> [!TIP]\n> **Recommended Pick:** ${bestPick.name} (${bestPick.probability}% probability)\n\n`;
      }
      md += `---\n\n`;
    }

    const artifactPath = path.join(process.env.HOME || '/Users/troykayanja', '.gemini/antigravity/brain/1e67b682-2e9f-4e0b-baca-6cb854518469/artifacts/future_predictions.md');
    fs.writeFileSync(artifactPath, md);
    console.log("Predictions successfully written to artifact.");

  } catch (err) {
    console.error("Error generating predictions:", err.response?.data || err.message);
  }
}

run();
