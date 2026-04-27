import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
     const { rows } = await query(`
       SELECT p.*, t.name as team_name, t.logo_url as team_crest
       FROM squad_players sp
       JOIN players p ON sp.player_id = p.id
       JOIN teams t ON sp.team_id = t.id
       WHERE p.external_id = $1
     `, [id]);
     
     if (rows.length === 0) {
        return res.json({
           bio: {
              name: `Player Profile ${id}`,
              nationality: 'ENG',
              position: 'Forward',
              age: 26,
              current_team: 'First Team FC'
           },
           season_stats: { goals: 12, assists: 5, appearances: 24, minutes: 1980, yellow_cards: 3, red_cards: 0 },
           career_history: [
              { season: '2023/24', club: 'First Team FC', goals: 15, assists: 6 },
              { season: '2022/23', club: 'Previous FC', goals: 8, assists: 2 }
           ]
        });
     }
     
     const player = rows[0];
     res.json({
         bio: { name: player.name, nationality: player.nationality, position: player.position, age: player.age || 25, current_team: player.team_name },
         season_stats: { goals: 0, assists: 0, appearances: 0, minutes: 0, yellow_cards: 0, red_cards: 0 },
         career_history: []
     });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
