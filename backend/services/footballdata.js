import axios from 'axios';

export const client = axios.create({
  baseURL: 'https://api.football-data.org/v4/',
  timeout: 10000,
});

// Inject token dynamically at request time (avoids dotenv ES-module race)
client.interceptors.request.use(config => {
  config.headers['X-Auth-Token'] = process.env.FOOTBALLDATA_TOKEN || '';
  return config;
});

// Delay helper to avoid hitting 10 req/min rate limit
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const LEAGUE_CODES = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'BSA', 'CL', 'EL', 'ELC']; // EL = Europa League

// Get today's date in YYYY-MM-DD format
function today() { return new Date().toISOString().split('T')[0]; }

// Get date N days from now
function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Normalise a match from football-data.org v4 to our unified shape
export function normalise(m) {
  // Score is ALWAYS at m.score.fullTime.home and m.score.fullTime.away
  // For SCHEDULED matches these are null — that is correct, do NOT replace with 0
  const homeScore = m.score?.fullTime?.home  ?? null;
  const awayScore = m.score?.fullTime?.away  ?? null;
  const htHome    = m.score?.halfTime?.home  ?? null;
  const htAway    = m.score?.halfTime?.away  ?? null;

  // Status mapping — football-data.org uses TIMED for upcoming (not SCHEDULED)
  // Normalise both to a consistent set
  const statusMap = {
    'SCHEDULED': 'SCHEDULED',
    'TIMED':     'SCHEDULED',  // upcoming with confirmed time
    'IN_PLAY':   'IN_PLAY',
    'PAUSED':    'PAUSED',     // half time
    'FINISHED':  'FINISHED',
    'AWARDED':   'FINISHED',
    'POSTPONED': 'POSTPONED',
    'CANCELLED': 'CANCELLED',
    'SUSPENDED': 'SUSPENDED',
  };

  return {
    id:       'fd_' + m.id,
    homeTeam: {
      id:    'fd_t_' + m.homeTeam.id,
      name:  m.homeTeam.name,
      crest: m.homeTeam.crest || null,
    },
    awayTeam: {
      id:    'fd_t_' + m.awayTeam.id,
      name:  m.awayTeam.name,
      crest: m.awayTeam.crest || null,
    },
    score: {
      home: homeScore,
      away: awayScore,
    },
    halfTime: {
      home: htHome,
      away: htAway,
    },
    winner:   m.score?.winner || null,  // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    minute:   m.minute ?? null,
    status:   statusMap[m.status] || m.status,
    date:     m.utcDate,
    league: {
      name:    m.competition.name,
      code:    m.competition.code,
      country: m.area?.name || '',
    },
    venue:     m.venue    || '',
    matchday:  m.matchday || null,
    referee:   m.referees?.[0]?.name || null,
    source:   'footballdata',
    // Probabilities calculated separately, default null until computed
    home_prob: null,
    draw_prob: null,
    away_prob: null,
  };
}

// ALL live matches right now
export async function getLiveMatches() {
  const codes = LEAGUE_CODES.join(',');
  const r = await client.get('matches', { params: { competitions: codes, status: 'IN_PLAY,PAUSED' } });
  return (r.data.matches || []).map(normalise);
}

// Today's matches
export async function getTodayMatches() {
  const codes = LEAGUE_CODES.join(',');
  const r = await client.get('matches', { params: { competitions: codes, dateFrom: today(), dateTo: today() } });
  return (r.data.matches || []).map(normalise);
}

// Upcoming matches (next N days) — FD limits date ranges to 10 days max
export async function getUpcomingMatches(days = 6) {
  const codes = LEAGUE_CODES.join(',');
  const safedays = Math.min(days, 8); // keep under 10-day API limit
  const r = await client.get('matches', {
    params: { competitions: codes, dateFrom: today(), dateTo: futureDate(safedays) }
  });
  return (r.data.matches || []).map(normalise);
}

// Standings for a league
export async function getStandings(code) {
  const r = await client.get(`competitions/${code}/standings`);
  return r.data;
}

// All standings (with rate-limit spacing)
export async function getAllStandings() {
  const result = {};
  for (const code of LEAGUE_CODES) {
    try {
      result[code] = await getStandings(code);
    } catch (e) {
      console.error('Standings error for', code, e.message);
    }
    await sleep(7000); // 7s gap = safe under 10 req/min
  }
  return result;
}

// Top scorers
export async function getTopScorers(code, limit = 20) {
  const r = await client.get(`competitions/${code}/scorers`, { params: { limit } });
  return r.data.scorers || [];
}

// Match detail (lineups, goals, cards, subs)
export async function getMatch(fdId) {
  const r = await client.get(`matches/${fdId}`);
  return normalise(r.data);
}

// H2H for a match
export async function getH2H(fdMatchId, limit = 10) {
  const r = await client.get(`matches/${fdMatchId}/head2head`, { params: { limit } });
  return r.data;
}

// Team info + squad
export async function getTeam(fdTeamId) {
  const cleanId = String(fdTeamId).replace('fd_t_', '');
  const r = await client.get(`teams/${cleanId}`);
  return r.data;
}

// Team matches (for form)
export async function getTeamMatches(fdTeamId, params = {}) {
  const cleanId = String(fdTeamId).replace('fd_t_', '');
  const r = await client.get(`teams/${cleanId}/matches`, { params });
  return r.data;
}

export default {
  client, getLiveMatches, getTodayMatches, getUpcomingMatches,
  getStandings, getAllStandings, getTopScorers,
  getMatch, getH2H, getTeam, getTeamMatches,
  LEAGUE_CODES, normalise
};
