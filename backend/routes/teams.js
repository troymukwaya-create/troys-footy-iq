import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
     const { rows: teamRows } = await query(`
       SELECT t.*, l.name as league_name, l.code as league_code, ls.played, ls.won, ls.drawn, ls.lost, ls.goals_for, ls.goals_against, ls.form, ls.rank
       FROM teams t
       JOIN leagues l ON t.league_id = l.id
       LEFT JOIN league_standings ls ON t.id = ls.team_id AND ls.season = $2
       WHERE t.external_id = $1
     `, [id, new Date().getFullYear()]);
     
     if (teamRows.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
     }
     
     const teamData = teamRows[0];
     
     const { rows: past } = await query(`
       SELECT f.external_id as id, f.match_date as date, f.status, th.name as home_name, th.logo_url as home_crest, ta.name as away_name, ta.logo_url as away_crest, f.home_goals, f.away_goals
       FROM fixtures f
       JOIN teams th ON f.home_team_id = th.id
       JOIN teams ta ON f.away_team_id = ta.id
       WHERE (f.home_team_id = $1 OR f.away_team_id = $1) AND f.status IN ('FINISHED', 'AWARDED')
       ORDER BY f.match_date DESC LIMIT 10
     `, [teamData.id]);
     
     const { rows: upcoming } = await query(`
       SELECT f.external_id as id, f.match_date as date, f.status, th.name as home_name, th.logo_url as home_crest, ta.name as away_name, ta.logo_url as away_crest
       FROM fixtures f
       JOIN teams th ON f.home_team_id = th.id
       JOIN teams ta ON f.away_team_id = ta.id
       WHERE (f.home_team_id = $1 OR f.away_team_id = $1) AND f.status IN ('SCHEDULED', 'TIMED')
       ORDER BY f.match_date ASC LIMIT 5
     `, [teamData.id]);

     const btts_count = past.filter(m => m.home_goals > 0 && m.away_goals > 0).length;
     const over25_count = past.filter(m => (m.home_goals + m.away_goals) > 2).length;

     res.json({
        team: {
           id: teamData.external_id,
           name: teamData.name,
           short_name: teamData.short_name,
           logo_url: teamData.logo_url,
           stadium: teamData.stadium,
           position: teamData.rank
        },
        stats: {
           played: teamData.played || 0,
           won: teamData.won || 0,
           drawn: teamData.drawn || 0,
           lost: teamData.lost || 0,
           goals_for: teamData.goals_for || 0,
           goals_against: teamData.goals_against || 0,
           clean_sheets: past.filter(m => (m.home_name === teamData.name && m.away_goals === 0) || (m.away_name === teamData.name && m.home_goals === 0)).length,
           form: teamData.form || 'WDLWD',
           btts_count,
           over25_count
        },
        past: past.map(r => ({ id: r.id, date: r.date, status: r.status, homeTeam: { name: r.home_name, crest: r.home_crest }, awayTeam: { name: r.away_name, crest: r.away_crest }, score: { home: r.home_goals, away: r.away_goals } })),
        upcoming: upcoming.map(r => ({ id: r.id, date: r.date, status: r.status, homeTeam: { name: r.home_name, crest: r.home_crest }, awayTeam: { name: r.away_name, crest: r.away_crest } }))
     });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
