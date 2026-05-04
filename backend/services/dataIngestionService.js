// ─── UNIFIED DATA INGESTION SERVICE ─────────────────────────────────
// Merges data from multiple sources (football-data.org + API-Football)
// into a single pipeline. Handles deduplication, normalization, and
// scheduled ingestion of fixtures, results, and team statistics.

import { safeQuery, isDbAvailable } from '../db/index.js';
import * as fd from './footballdata.js';
import api from './apisports.js';
import { upsertFixture, upsertTeam } from '../db/upsert.js';
import { FD_LEAGUES } from '../constants/leagues.js';
import { storePrediction } from './predictionService.js';
import { predictStatic } from '../engine/inferenceEngine.js';
import { normalizeTeamStats } from './normalizer.js';

/**
 * Ingest today's and upcoming fixtures from all data sources.
 * Runs daily via scheduler. Deduplicates and normalizes.
 */
export async function ingestDailyFixtures() {
  if (!isDbAvailable()) {
    console.log('[INGEST] Skipping — DB not available');
    return { ingested: 0 };
  }

  console.log('[INGEST] Starting daily fixture ingestion...');
  let ingested = 0;

  try {
    // Source 1: football-data.org — primary
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + 9 * 86400000).toISOString().split('T')[0];

    const fdResponse = await fd.client.get('matches', {
      params: {
        competitions: fd.LEAGUE_CODES.join(','),
        dateFrom: today,
        dateTo: future,
      },
    }).catch(err => {
      console.error('[INGEST] FD fetch failed:', err.message);
      return { data: { matches: [] } };
    });

    const fdMatches = (fdResponse.data.matches || []).map(fd.normalise);

    for (const match of fdMatches) {
      try {
        // Resolve league
        const leagueResult = await safeQuery(
          `SELECT id FROM leagues WHERE code = $1`,
          [match.league?.code]
        );
        const leagueId = leagueResult?.rows?.[0]?.id;
        if (!leagueId) continue;

        await upsertFixture(match, leagueId);
        ingested++;
      } catch {
        // Skip individual fixture errors
      }
    }

    // Source 2: API-Football — secondary enrichment
    if (api.hasKey()) {
      try {
        const apfMatches = await api.getTodayFixtures();
        for (const match of apfMatches) {
          try {
            const leagueResult = await safeQuery(
              `SELECT id FROM leagues WHERE code = $1`,
              [match.league?.code]
            );
            const leagueId = leagueResult?.rows?.[0]?.id;
            if (!leagueId) continue;

            await upsertFixture(match, leagueId);
            ingested++;
          } catch {
            // Skip
          }
        }
      } catch (err) {
        console.error('[INGEST] API-Football fetch failed:', err.message);
      }
    }

    console.log(`[INGEST] Daily ingestion complete: ${ingested} fixtures.`);
    return { ingested };
  } catch (err) {
    console.error('[INGEST] Daily ingestion error:', err.message);
    return { ingested, error: err.message };
  }
}

/**
 * Generate and store predictions for upcoming matches.
 * Runs daily — only predicts matches that don't already have a prediction.
 */
export async function generateDailyPredictions() {
  if (!isDbAvailable()) return { generated: 0 };

  console.log('[PREDICT] Generating daily predictions...');

  // Get upcoming fixtures from DB that don't have predictions yet
  const result = await safeQuery(`
    SELECT f.id, f.external_id, f.match_date,
      ht.name as home_team, at.name as away_team,
      hs.avg_goals_for as home_avg_gf, hs.avg_goals_against as home_avg_ga,
      hs.form as home_form, hs.played as home_played,
      hs.wins as home_wins, hs.draws as home_draws,
      aws.avg_goals_for as away_avg_gf, aws.avg_goals_against as away_avg_ga,
      aws.form as away_form, aws.played as away_played,
      aws.wins as away_wins, aws.draws as away_draws
    FROM fixtures f
    JOIN teams ht ON f.home_team_id = ht.id
    JOIN teams at ON f.away_team_id = at.id
    LEFT JOIN team_season_stats hs ON hs.team_id = f.home_team_id AND hs.league_id = f.league_id
    LEFT JOIN team_season_stats aws ON aws.team_id = f.away_team_id AND aws.league_id = f.league_id
    LEFT JOIN predictions p ON p.fixture_id = f.id
    WHERE f.status IN ('SCHEDULED', 'NS', 'TIMED')
      AND f.match_date > NOW()
      AND f.match_date < NOW() + INTERVAL '3 days'
      AND p.id IS NULL
    ORDER BY f.match_date ASC
    LIMIT 30
  `);

  const upcoming = result?.rows || [];
  let generated = 0;

  for (const match of upcoming) {
    try {
      const homeStats = normalizeTeamStats({
        played: match.home_played || 0,
        goalsFor: Math.round((match.home_avg_gf || 1.35) * (match.home_played || 10)),
        goalsAgainst: Math.round((match.home_avg_ga || 1.15) * (match.home_played || 10)),
        wins: match.home_wins || 0,
        draws: match.home_draws || 0,
        form: match.home_form || 'N/A',
      });

      const awayStats = normalizeTeamStats({
        played: match.away_played || 0,
        goalsFor: Math.round((match.away_avg_gf || 1.15) * (match.away_played || 10)),
        goalsAgainst: Math.round((match.away_avg_ga || 1.35) * (match.away_played || 10)),
        wins: match.away_wins || 0,
        draws: match.away_draws || 0,
        form: match.away_form || 'N/A',
      });

      const prediction = predictStatic(homeStats, awayStats);

      await storePrediction({
        matchExternalId: match.external_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        prediction,
        features: null,
      });

      generated++;
    } catch {
      // Skip failed predictions
    }
  }

  console.log(`[PREDICT] Generated ${generated} predictions.`);
  return { generated };
}

/**
 * Enrich a fixture with API-Football data (xG, shots, detailed stats).
 * Returns additional statistics or null if unavailable.
 */
export async function enrichWithApiFootball(matchExternalId) {
  if (!api.hasKey()) return null;

  try {
    // Only works with apf_ prefixed IDs
    if (!matchExternalId.startsWith('apf_')) return null;

    const stats = await api.getFixtureStats(matchExternalId);
    if (!stats) return null;

    // Normalize into our format
    const teams = Object.keys(stats);
    if (teams.length < 2) return null;

    const enriched = {};
    for (const teamName of teams) {
      const s = stats[teamName];
      enriched[teamName] = {
        shots: parseInt(s['Total Shots'] || s['Shots on Goal'] || 0),
        shotsOnTarget: parseInt(s['Shots on Goal'] || 0),
        possession: parseFloat(String(s['Ball Possession'] || '50%').replace('%', '')),
        passAccuracy: parseFloat(String(s['Passes %'] || '80%').replace('%', '')),
        corners: parseInt(s['Corner Kicks'] || 0),
        fouls: parseInt(s['Fouls'] || 0),
        xG: parseFloat(s['expected_goals'] || 0), // API-Football v3 xG
      };
    }

    return enriched;
  } catch (err) {
    console.error('[ENRICH] API-Football enrichment failed:', err.message);
    return null;
  }
}

export default {
  ingestDailyFixtures,
  generateDailyPredictions,
  enrichWithApiFootball,
};
