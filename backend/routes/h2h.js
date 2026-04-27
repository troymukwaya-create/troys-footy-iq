import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

router.get('/:team1Id/:team2Id', async (req, res) => {
  const { team1Id, team2Id } = req.params;
  try {
     const { rows: teams } = await query('SELECT id, external_id FROM teams WHERE external_id IN ($1, $2)', [String(team1Id), String(team2Id)]);
     if (teams.length < 2) return res.json({ db_history: [] });
     
     const t1 = teams.find(t => t.external_id === String(team1Id))?.id;
     const t2 = teams.find(t => t.external_id === String(team2Id))?.id;

     if (!t1 || !t2) return res.json({ db_history: [] });

     const { rows } = await query(`
       SELECT f.external_id as id, f.match_date as date, f.status, f.home_goals, f.away_goals,
              th.name as home_name, th.logo_url as home_crest,
              ta.name as away_name, ta.logo_url as away_crest
       FROM fixtures f
       JOIN teams th ON f.home_team_id = th.id
       JOIN teams ta ON f.away_team_id = ta.id
       WHERE (f.home_team_id = $1 AND f.away_team_id = $2) OR (f.home_team_id = $2 AND f.away_team_id = $1)
       ORDER BY f.match_date DESC LIMIT 20
     `, [t1, t2]);

     res.json({
        db_history: rows.map(r => ({
           id: r.id, date: r.date, status: r.status,
           homeTeam: { name: r.home_name, crest: r.home_crest },
           awayTeam: { name: r.away_name, crest: r.away_crest },
           score: { home: r.home_goals, away: r.away_goals }
        }))
     });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
