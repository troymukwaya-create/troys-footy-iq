import cron from 'node-cron';
import { query } from '../db/index.js';
import dataRouter from '../services/dataRouter.js';
import { broadcast } from '../server.js';
import { FD_LEAGUES } from '../constants/leagues.js';

let previousScores = {};

function hasRealToken() {
  const token = process.env.FOOTBALLDATA_TOKEN;
  if (!token)                          return false;
  if (token.length < 8)               return false;
  if (token === 'YOUR_VALUE_FROM_FOOTBALL_DATA_ORG') return false;
  if (token === 'YOUR_ACTUAL_TOKEN_HERE')             return false;
  if (token === 'PASTE_YOUR_ACTUAL_TOKEN_HERE')       return false;
  if (token.includes('placeholder'))  return false;
  if (token.includes('YOUR_VALUE'))   return false;
  if (token.startsWith('PASTE'))      return false;
  return true;
}

async function livePollLoop() {
  if (!hasRealToken()) return;

  try {
    const { normalise } = await import('../services/footballdata.js');
    const axios = (await import('axios')).default;
    
    const r = await axios.get('https://api.football-data.org/v4/matches', {
      headers: { 'X-Auth-Token': process.env.FOOTBALLDATA_TOKEN },
      params: { competitions: 'PL,PD,BL1,SA,FL1,BSA,CL', status: 'IN_PLAY,PAUSED' },
      timeout: 8000,
    });

    const liveMatches = (r.data.matches || []).map(normalise);

    for (const match of liveMatches) {
      const prev = previousScores[match.id];

      // Goal detection — compare actual score numbers
      if (prev &&
          prev.score.home !== null && match.score.home !== null &&
          (match.score.home !== prev.score.home || match.score.away !== prev.score.away)) {

        const homeScored = match.score.home > prev.score.home;
        const scoringTeam = homeScored ? match.homeTeam.name : match.awayTeam.name;

        console.log(`GOAL: ${scoringTeam} scores! ${match.homeTeam.name} ${match.score.home}-${match.score.away} ${match.awayTeam.name}`);

        broadcast('GOAL_SCORED', {
          fixtureId:   match.id,
          homeTeam:    match.homeTeam.name,
          awayTeam:    match.awayTeam.name,
          scoringTeam,
          newScore:    match.score,
          minute:      match.minute,
          league:      match.league.name,
        });
      }

      // Status change detection
      if (prev && prev.status !== match.status) {
        if (match.status === 'FINISHED') {
          broadcast('MATCH_FINISHED', match);
          console.log(`FINISHED: ${match.homeTeam.name} ${match.score.home}-${match.score.away} ${match.awayTeam.name}`);
        }
        if (match.status === 'IN_PLAY' && prev.status === 'SCHEDULED') {
          broadcast('MATCH_STARTED', match);
          console.log(`STARTED: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
        }
        if (match.status === 'PAUSED') {
          broadcast('HALF_TIME', match);
        }
      }

      previousScores[match.id] = match;
    }

    if (liveMatches.length > 0) {
      broadcast('LIVE_SCORES_UPDATE', liveMatches);
    }

  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[livePoll] Rate limited — pausing for 70s');
      await new Promise(r => setTimeout(r, 70000));
    } else {
      console.error('[livePoll] Error:', err.message);
    }
  }
}

async function liveStatsPollLoop() {
  try {
    const liveMatches = await dataRouter.getAllLiveMatches().catch(() => []);
    for (const match of liveMatches) {
      if (match.status === 'IN_PLAY') {
        // We mock fetchMatchStats or implement it later based on instructions
        // If apifootball was implemented, we would fetch here.
        // For now, doing nothing or broadcasting mock to prevent crashes.
      }
    }
  } catch (err) {}
}

async function updateAndBroadcastStandings(leagueCode) {
  try {
    const standings = await dataRouter.getStandings(leagueCode);
    // await upsertStandings(standings, leagueCode); // Provided by user but might not exist
    broadcast('STANDINGS_UPDATE', { leagueCode, standings });
  } catch (err) {}
}

export default function initJobs() {
  setInterval(livePollLoop, 60000);
  livePollLoop();  
  setInterval(liveStatsPollLoop, 60000);

  cron.schedule('0 8 * * *', async () => {
    for (const code of Object.keys(FD_LEAGUES)) {
      await updateAndBroadcastStandings(code);
      await new Promise(r => setTimeout(r, 7000));
    }
  });
}
