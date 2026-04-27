import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as fd from '../services/footballdata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const router = express.Router();

function calculateForm(matches, teamId) {
  // Ensure we only look at finished matches
  return matches
    .filter(m => m.status === 'FINISHED')
    .map(m => {
      const winner = m.score?.winner;
      if (!winner || winner === 'DRAW') return 'D';
      const isHome = m.homeTeam.id === teamId;
      if (winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM')) return 'W';
      return 'L';
    })
    .join('');
}

router.get('/:matchId', async (req, res) => {
  const { matchId } = req.params;
  
  if (!process.env.FOOTBALLDATA_TOKEN) {
    return res.status(500).json({ error: 'FOOTBALLDATA_TOKEN not configured in backend/.env' });
  }

  try {
    console.log(`[matchData] Fetching data for match: ${matchId}`);
    
    // 1. Fetch main match details
    const match = await fd.getMatch(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const homeTeamId = parseInt(match.homeTeam.id.replace('fd_t_', ''));
    const awayTeamId = parseInt(match.awayTeam.id.replace('fd_t_', ''));
    const leagueCode = match.league.code;

    // 2. Fetch related data in parallel
    const [h2hData, homeMatches, awayMatches, standingsData] = await Promise.all([
      fd.getH2H(matchId.replace('fd_', ''), 5).catch(e => { console.error('H2H fetch error:', e.message); return { matches: [] }; }),
      fd.getTeamMatches(homeTeamId, { status: 'FINISHED', limit: 8 }).catch(e => { console.error('Home matches fetch error:', e.message); return { matches: [] }; }),
      fd.getTeamMatches(awayTeamId, { status: 'FINISHED', limit: 8 }).catch(e => { console.error('Away matches fetch error:', e.message); return { matches: [] }; }),
      fd.getStandings(leagueCode).catch(e => { console.error('Standings fetch error:', e.message); return { standings: [] }; })
    ]);

    // Log the actual API responses for debugging as requested
    console.log('[DEBUG] Match metadata:', JSON.stringify(match, null, 2));
    console.log('[DEBUG] H2H sample:', JSON.stringify(h2hData.matches?.[0] || 'none', null, 2));

    // 3. Process form
    const homeForm = calculateForm(homeMatches.matches || [], homeTeamId);
    const awayForm = calculateForm(awayMatches.matches || [], awayTeamId);

    // 4. Return standardized response
    res.json({
      metadata: {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        date: match.date,
        venue: match.venue,
        status: match.status,
        score: match.score,
        league: match.league
      },
      form: {
        home: homeForm.slice(0, 5),
        away: awayForm.slice(0, 5)
      },
      h2h: (h2hData.matches || []).map(m => fd.normalise(m)).slice(0, 5),
      standings: standingsData.standings?.[0]?.table || []
    });

  } catch (err) {
    console.error(`[matchData Error] ${err.message}`);
    res.status(err.response?.status || 500).json({
      error: err.message,
      apiMessage: err.response?.data?.message
    });
  }
});

export default router;
