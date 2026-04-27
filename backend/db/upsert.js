import { query } from './index.js';

export async function upsertTeam(team, league_id) {
  if (!team || !team.id) return null;
  const res = await query(`
    INSERT INTO teams (external_id, name, short_name, league_id, logo_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (external_id) DO UPDATE SET 
      name = EXCLUDED.name, short_name = EXCLUDED.short_name, logo_url = EXCLUDED.logo_url
    RETURNING id
  `, [String(team.id), team.name, team.shortName || team.name, league_id, team.crest]);
  return res.rows[0].id;
}

export async function upsertFixture(match, league_id) {
  if (!league_id) {
     const lRes = await query(`SELECT id FROM leagues WHERE code = $1`, [match.league?.code]);
     league_id = lRes.rows[0]?.id;
  }
  if (!league_id) return null;

  const homeId = await upsertTeam(match.homeTeam, league_id);
  const awayId = await upsertTeam(match.awayTeam, league_id);
  if (!homeId || !awayId) return null;

  const res = await query(`
    INSERT INTO fixtures (external_id, league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, ht_home, ht_away, venue, minute)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (external_id) DO UPDATE SET
      status = EXCLUDED.status, home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
      ht_home = EXCLUDED.ht_home, ht_away = EXCLUDED.ht_away, minute = EXCLUDED.minute
    RETURNING id
  `, [match.id, league_id, homeId, awayId, match.date, match.status, match.score?.home, match.score?.away, match.halfTime?.home, match.halfTime?.away, match.venue, match.minute]);
  return res.rows[0].id;
}
