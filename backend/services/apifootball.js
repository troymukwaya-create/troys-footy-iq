import axios from 'axios';
import dotenv from 'dotenv';
import { APF_LEAGUES } from '../constants/leagues.js';

dotenv.config();

const api = axios.create({
  baseURL: 'https://api-football-v1.p.rapidapi.com/v3/',
  headers: {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': process.env.RAPIDAPI_HOST || 'api-football-v1.p.rapidapi.com'
  }
});

// A simple local request counter for safety (limit 100/day)
// In production, this should be tracked in the cache or DB
let requestCounter = 0;

function mapMatch(m) {
  if (!m) return null;
  const fixture = m.fixture;
  const teams = m.teams;
  const goals = m.goals;
  const score = m.score;
  const league = m.league;

  let status = 'SCHEDULED';
  if (['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(fixture.status.short)) {
    status = fixture.status.short === 'HT' ? 'PAUSED' : 'IN_PLAY';
  } else if (['FT', 'AET', 'PEN'].includes(fixture.status.short)) {
    status = 'FINISHED';
  }

  return {
    id: 'apf_' + fixture.id,
    homeTeam: { id: teams.home?.id, name: teams.home?.name, crest: teams.home?.logo },
    awayTeam: { id: teams.away?.id, name: teams.away?.name, crest: teams.away?.logo },
    score: { 
      home: goals.home ?? null,
      away: goals.away ?? null
    },
    halfTime: {
      home: score.halftime?.home ?? null,
      away: score.halftime?.away ?? null
    },
    minute: fixture.status.elapsed ?? null,
    status: status,
    date: fixture.date,
    league: league ? { name: league.name, code: String(league.id), country: league.country } : null,
    venue: fixture.venue?.name || null,
    source: 'apifootball'
  };
}

const get = async (url, params = {}) => {
  if (requestCounter >= 100) {
    console.warn(`[APF API] Daily limit reached! Blocking request to ${url}`);
    return { response: [] }; 
  }
  try {
    requestCounter++;
    const res = await api.get(url, { params });
    return res.data;
  } catch (err) {
    console.error(`[APF API Error] ${url}:`, err.response?.data?.message || err.message);
    throw err;
  }
};

export async function getLiveFixtures() {
  const data = await get('fixtures', { live: 'all' });
  const matches = data.response || [];
  // Filter to only our target APF_LEAGUES
  const apfLeagueIds = Object.keys(APF_LEAGUES).map(Number);
  const filtered = matches.filter(m => apfLeagueIds.includes(m.league.id));
  return filtered.map(mapMatch);
}

export async function getFixtures(leagueId, season) {
  const data = await get('fixtures', { league: leagueId, season });
  return (data.response || []).map(mapMatch);
}

export async function getStandings(leagueId, season) {
  const data = await get('standings', { league: leagueId, season });
  return data.response?.[0]?.league?.standings?.[0] || [];
}

export async function getH2H(team1Id, team2Id, last = 10) {
  const data = await get('fixtures/headtohead', { h2h: `${team1Id}-${team2Id}`, last });
  return (data.response || []).map(mapMatch);
}

export async function getPlayerStats(playerId, season) {
  const data = await get('players', { id: playerId, season });
  return data.response || [];
}

export default {
  getLiveFixtures,
  getFixtures,
  getStandings,
  getH2H,
  getPlayerStats,
  mapMatch,
  getRequestCount: () => requestCounter
};
