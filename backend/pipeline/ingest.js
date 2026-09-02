// ─── HISTORICAL DATA INGESTION PIPELINE ─────────────────────────────
// Fetches completed season data from football-data.org and stores it
// in PostgreSQL for model training. Computes rolling team stats for
// each matchday with strict anti-leakage (only pre-match data).
//
// Usage: node --experimental-modules pipeline/ingest.js [LEAGUE] [SEASON]
// Example: node pipeline/ingest.js PL 2024

import { query, getClient } from '../db/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { FD_LEAGUES } from '../constants/leagues.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FD_BASE = 'https://api.football-data.org/v4';

// ─── Rate limiter (football-data.org free tier: 10 req/min) ────────
let lastRequestTime = 0;
async function rateLimited(fn) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 6500) { // ~9 req/min to be safe
    await new Promise(r => setTimeout(r, 6500 - elapsed));
  }
  lastRequestTime = Date.now();
  return fn();
}

async function fetchFD(path) {
  const token = process.env.FOOTBALLDATA_TOKEN;
  if (!token || token.length < 8) {
    throw new Error('FOOTBALLDATA_TOKEN not set or invalid');
  }

  const axios = (await import('axios')).default;
  return rateLimited(() =>
    axios.get(`${FD_BASE}${path}`, {
      headers: { 'X-Auth-Token': token },
      timeout: 15000,
    })
  );
}

/**
 * Ingest a full season for a league.
 * Fetches all finished matches, computes rolling stats, and stores everything.
 */
export async function ingestSeason(leagueCode, season) {
  const leagueInfo = FD_LEAGUES[leagueCode];
  if (!leagueInfo) throw new Error(`Unknown league: ${leagueCode}`);

  console.log(`\n═══ Ingesting ${leagueInfo.name} ${season}/${season + 1} ═══`);

  // 1. Ensure league exists in DB
  const leagueId = await ensureLeague(leagueCode, leagueInfo);

  // 2. Fetch all matches for season
  console.log('  Fetching matches...');
  const response = await fetchFD(`/competitions/${leagueCode}/matches?season=${season}&status=FINISHED`);
  const rawMatches = response.data?.matches || [];
  console.log(`  Found ${rawMatches.length} finished matches`);

  if (rawMatches.length === 0) return { league: leagueCode, season, ingested: 0 };

  // 3. Sort chronologically (critical for anti-leakage)
  rawMatches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  // 4. Build rolling stats per team as we iterate chronologically
  const teamRollingStats = new Map(); // teamName -> { results: [], ... }
  let ingested = 0;
  let skipped = 0;

  for (const match of rawMatches) {
    try {
      const homeName = match.homeTeam?.name;
      const awayName = match.awayTeam?.name;
      const homeGoals = match.score?.fullTime?.home;
      const awayGoals = match.score?.fullTime?.away;

      if (!homeName || !awayName || homeGoals == null || awayGoals == null) {
        skipped++;
        continue;
      }

      // Compute stats from ONLY prior matches (anti-leakage)
      const homeStats = computeRollingStats(teamRollingStats.get(homeName));
      const awayStats = computeRollingStats(teamRollingStats.get(awayName));

      // Ensure teams exist
      const homeTeamId = await ensureTeam(match.homeTeam, leagueId);
      const awayTeamId = await ensureTeam(match.awayTeam, leagueId);

      // Store fixture
      const fixtureId = await upsertFixture({
        externalId: `fd_${match.id}`,
        leagueId,
        homeTeamId,
        awayTeamId,
        matchDate: match.utcDate,
        status: 'FINISHED',
        homeGoals,
        awayGoals,
        htHome: match.score?.halfTime?.home,
        htAway: match.score?.halfTime?.away,
        venue: match.venue || '',
        referee: match.referees?.[0]?.name || null,
      });

      // Store the pre-match stats snapshot (what was known BEFORE this match)
      if (homeStats.played > 0 || awayStats.played > 0) {
        await upsertStatsSnapshot(homeTeamId, leagueId, season, homeStats);
        await upsertStatsSnapshot(awayTeamId, leagueId, season, awayStats);
      }

      // NOW update rolling stats with this match result (for future matches)
      updateRollingStats(teamRollingStats, homeName, homeGoals, awayGoals, true);
      updateRollingStats(teamRollingStats, awayName, awayGoals, homeGoals, false);

      ingested++;
    } catch (err) {
      console.error(`  Error on match ${match.id}:`, err.message);
      skipped++;
    }
  }

  console.log(`  ✅ Ingested ${ingested} matches, skipped ${skipped}`);
  return { league: leagueCode, season, ingested, skipped };
}

// ─── Rolling Stats Engine ───────────────────────────────────────────

function computeRollingStats(teamHistory) {
  if (!teamHistory || teamHistory.length === 0) {
    return { played: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, form: 'N/A', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
  }

  const recent = teamHistory.slice(-20); // Last 20 matches
  const played = recent.length;
  const goalsFor = recent.reduce((s, m) => s + m.gf, 0);
  const goalsAgainst = recent.reduce((s, m) => s + m.ga, 0);
  const wins = recent.filter(m => m.gf > m.ga).length;
  const draws = recent.filter(m => m.gf === m.ga).length;
  const losses = recent.filter(m => m.gf < m.ga).length;
  const cleanSheets = recent.filter(m => m.ga === 0).length;
  const form = recent.slice(-5).map(m => m.gf > m.ga ? 'W' : m.gf === m.ga ? 'D' : 'L').join('');

  return {
    played,
    avgGoalsFor: parseFloat((goalsFor / played).toFixed(2)),
    avgGoalsAgainst: parseFloat((goalsAgainst / played).toFixed(2)),
    form,
    wins, draws, losses,
    goalsFor, goalsAgainst,
    cleanSheets,
  };
}

function updateRollingStats(statsMap, teamName, goalsFor, goalsAgainst, isHome) {
  if (!statsMap.has(teamName)) statsMap.set(teamName, []);
  statsMap.get(teamName).push({ gf: goalsFor, ga: goalsAgainst, isHome });
}

// ─── DB Helpers ─────────────────────────────────────────────────────

async function ensureLeague(code, info) {
  const result = await query(
    `INSERT INTO leagues (code, name, country, source) VALUES ($1, $2, $3, 'football-data.org')
     ON CONFLICT (code) DO UPDATE SET name = $2
     RETURNING id`,
    [code, info.name, info.country]
  );
  return result.rows[0].id;
}

async function ensureTeam(teamData, leagueId) {
  const externalId = `fd_${teamData.id}`;
  const result = await query(
    `INSERT INTO teams (external_id, name, short_name, league_id, logo_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (external_id) DO UPDATE SET name = $2, logo_url = $5
     RETURNING id`,
    [externalId, teamData.name, teamData.shortName || teamData.tla || '', leagueId, teamData.crest || null]
  );
  return result.rows[0].id;
}

async function upsertFixture(f) {
  const result = await query(
    `INSERT INTO fixtures (external_id, league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, ht_home, ht_away, venue, referee)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (external_id) DO UPDATE SET status = $6, home_goals = $7, away_goals = $8
     RETURNING id`,
    [f.externalId, f.leagueId, f.homeTeamId, f.awayTeamId, f.matchDate, f.status, f.homeGoals, f.awayGoals, f.htHome, f.htAway, f.venue, f.referee]
  );
  return result.rows[0].id;
}

async function upsertStatsSnapshot(teamId, leagueId, season, stats) {
  await query(
    `INSERT INTO team_season_stats (team_id, league_id, season, played, wins, draws, losses, goals_for, goals_against, clean_sheets, form, avg_goals_for, avg_goals_against)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (team_id, league_id, season) DO UPDATE SET
       played = $4, wins = $5, draws = $6, losses = $7, goals_for = $8, goals_against = $9,
       clean_sheets = $10, form = $11, avg_goals_for = $12, avg_goals_against = $13, last_updated = NOW()`,
    [teamId, leagueId, season, stats.played, stats.wins, stats.draws, stats.losses, stats.goalsFor, stats.goalsAgainst, stats.cleanSheets, stats.form, stats.avgGoalsFor, stats.avgGoalsAgainst]
  );
}

// ─── CLI Entry Point ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const leagueCodes = args[0] ? [args[0]] : Object.keys(FD_LEAGUES);
  const seasons = args[1] ? [parseInt(args[1])] : [2021, 2022, 2023, 2024, 2025];

  console.log('═══════════════════════════════════════════');
  console.log('  Historical Data Ingestion Pipeline');
  console.log(`  Leagues: ${leagueCodes.join(', ')}`);
  console.log(`  Seasons: ${seasons.join(', ')}`);
  console.log('═══════════════════════════════════════════');

  const results = [];
  for (const league of leagueCodes) {
    for (const season of seasons) {
      try {
        const result = await ingestSeason(league, season);
        results.push(result);
      } catch (err) {
        console.error(`  ❌ Failed ${league} ${season}:`, err.message);
        results.push({ league, season, error: err.message });
      }
    }
  }

  console.log('\n═══ SUMMARY ═══');
  const total = results.reduce((s, r) => s + (r.ingested || 0), 0);
  console.log(`Total matches ingested: ${total}`);
  console.table(results.map(r => ({ league: r.league, season: r.season, ingested: r.ingested || 0, error: r.error || '' })));

  process.exit(0);
}

// Only run if called directly
if (process.argv[1]?.includes('ingest')) {
  const dotenv = await import('dotenv');
  const envPath = path.join(__dirname, '../.env');
  dotenv.config({ path: envPath });
  // Fallback: try backend/.env directly
  if (!process.env.FOOTBALLDATA_TOKEN) {
    dotenv.config({ path: path.join(__dirname, '.env') });
  }
  const { initDb } = await import('../db/index.js');
  await initDb();
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

export default { ingestSeason };
