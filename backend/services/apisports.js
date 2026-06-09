import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE = 'https://v3.football.api-sports.io/';
const SEASON = 2025;

const LEAGUES = {
  WC: 1,                                  // FIFA World Cup 2026 — without this, WC fixtures are filtered out
  PL: 39, PD: 140, BL1: 78, SA: 135, FL1: 61,
  BSA: 71, BSB: 72, CL: 2, EL: 3, ECL: 848,
  ERE: 88, PPL: 94, CDB: 73,
};
const LEAGUE_ID_TO_CODE = Object.fromEntries(Object.entries(LEAGUES).map(([k,v]) => [v,k]));
const ALL_LEAGUE_IDS    = new Set(Object.values(LEAGUES));

function getKey()  { return process.env.APISPORTS_KEY || ''; }
function hasKey()  {
  const k = getKey();
  return k.length > 10 && !k.startsWith('YOUR') && !k.startsWith('PASTE') && !k.startsWith('API_KEY');
}

function call(endpoint, params = {}) {
  return axios.get(BASE + endpoint, {
    headers: { 'x-apisports-key': getKey() },
    params,
    timeout: 12000,
  });
}

const STATUS_MAP = {
  NS:'SCHEDULED', TBD:'SCHEDULED', '1H':'IN_PLAY', '2H':'IN_PLAY',
  HT:'PAUSED', ET:'IN_PLAY', BT:'PAUSED', P:'IN_PLAY',
  FT:'FINISHED', AET:'FINISHED', PEN:'FINISHED', AWD:'FINISHED',
  WO:'FINISHED', PST:'POSTPONED', CANC:'CANCELLED', ABD:'SUSPENDED',
  SUSP:'SUSPENDED', INT:'PAUSED', LIVE:'IN_PLAY',
};

function normalise(f) {
  const code = LEAGUE_ID_TO_CODE[f.league.id] || String(f.league.id);
  return {
    id:       'apf_' + f.fixture.id,
    homeTeam: { id: 'apf_t_' + f.teams.home.id, name: f.teams.home.name, crest: f.teams.home.logo },
    awayTeam: { id: 'apf_t_' + f.teams.away.id, name: f.teams.away.name, crest: f.teams.away.logo },
    score:    { home: f.goals.home ?? null, away: f.goals.away ?? null },
    halfTime: { home: f.score?.halftime?.home  ?? null, away: f.score?.halftime?.away  ?? null },
    fullTime: { home: f.score?.fulltime?.home  ?? null, away: f.score?.fulltime?.away  ?? null },
    penalty:  { home: f.score?.penalty?.home   ?? null, away: f.score?.penalty?.away   ?? null },
    minute:   f.fixture.status.elapsed ?? null,
    status:   STATUS_MAP[f.fixture.status.short] || 'SCHEDULED',
    statusRaw: f.fixture.status.short,
    date:     f.fixture.date,
    venue:    f.fixture.venue?.name  || '',
    city:     f.fixture.venue?.city  || '',
    referee:  f.fixture.referee      || null,
    league:   { name: f.league.name, code, country: f.league.country, logo: f.league.logo, round: f.league.round, season: f.league.season },
    matchday: f.league.round,
    home_prob: null, draw_prob: null, away_prob: null,
    source:   'apisports',
  };
}

function isTracked(f) {
  return ALL_LEAGUE_IDS.has(f.league?.id) || ALL_LEAGUE_IDS.has(parseInt(f.league?.id));
}

// Core fetch with error handling
async function safeFetch(endpoint, params) {
  try {
    const r = await call(endpoint, params);
    return r.data.response || [];
  } catch (err) {
    const s = err.response?.status;
    const m = err.response?.data?.message || err.message;
    console.error('[apisports]', endpoint, s, m);
    return [];
  }
}

// ── FIXTURES ────────────────────────────────────────
async function getLiveFixtures() {
  if (!hasKey()) return [];
  const raw = await safeFetch('fixtures', { live: 'all' });
  return raw.filter(isTracked).map(normalise);
}

async function getTodayFixtures() {
  if (!hasKey()) return [];
  const today = new Date().toISOString().split('T')[0];
  const raw   = await safeFetch('fixtures', { date: today, timezone: 'UTC' });
  return raw.filter(isTracked).map(normalise);
}

async function getUpcomingFixtures(days = 7) {
  if (!hasKey()) return [];
  const from = new Date().toISOString().split('T')[0];
  const to   = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
  const raw  = await safeFetch('fixtures', { from, to, timezone: 'UTC' });
  return raw.filter(isTracked).map(normalise);
}

async function getRecentFixtures(days = 3) {
  if (!hasKey()) return [];
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const to   = new Date().toISOString().split('T')[0];
  const raw  = await safeFetch('fixtures', { from, to, timezone: 'UTC' });
  return raw.filter(isTracked).map(normalise).filter(f => f.status === 'FINISHED');
}

// All fixtures for one competition + season (e.g. the full World Cup schedule).
async function getLeagueSeasonFixtures(leagueCode, season) {
  if (!hasKey()) return [];
  const leagueId = LEAGUES[leagueCode];
  if (!leagueId) return [];
  const raw = await safeFetch('fixtures', { league: leagueId, season });
  return raw.map(normalise);
}

// Deep recent-form stats from a team's last N finished matches across ALL
// competitions (qualifiers, friendlies, Nations League…). Works for national
// teams, which have no single-season league table. Returns rich intelligence:
// clean sheets, win rate, scoring consistency, and a recent-results list.
async function getTeamRecentForm(teamId, last = 10) {
  if (!hasKey()) return null;
  const numId = String(teamId).replace('apf_t_', '');
  const raw = await safeFetch('fixtures', { team: numId, last });
  const finished = raw.map(normalise)
    .filter(f => f.status === 'FINISHED' && f.score.home != null && f.score.away != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));   // most recent first
  if (!finished.length) return null;
  let gf = 0, ga = 0, w = 0, d = 0, l = 0, cleanSheets = 0, failedToScore = 0;
  const form = []; const recentResults = [];
  for (const m of finished) {
    const isHome = m.homeTeam.id === ('apf_t_' + numId);
    const my = isHome ? m.score.home : m.score.away;
    const opp = isHome ? m.score.away : m.score.home;
    const oppName = isHome ? m.awayTeam.name : m.homeTeam.name;
    gf += my; ga += opp;
    if (opp === 0) cleanSheets++;
    if (my === 0) failedToScore++;
    const res = my > opp ? 'W' : my < opp ? 'L' : 'D';
    if (res === 'W') w++; else if (res === 'L') l++; else d++;
    form.push(res);
    recentResults.push({ opponent: oppName, score: `${my}-${opp}`, result: res, competition: m.league?.name || '', date: m.date });
  }
  const played = w + d + l;
  if (!played) return null;
  return {
    played, wins: w, draws: d, losses: l, goalsFor: gf, goalsAgainst: ga,
    avgGoalsFor: parseFloat((gf / played).toFixed(2)),
    avgGoalsAgainst: parseFloat((ga / played).toFixed(2)),
    cleanSheets, failedToScore, winRate: Math.round((w / played) * 100),
    form: form.slice(0, 5).join(''),
    recentResults: recentResults.slice(0, 6),
  };
}

// Squad list for a national team (key players / availability).
async function getSquadList(teamId) {
  if (!hasKey()) return [];
  const numId = String(teamId).replace('apf_t_', '');
  const raw = await safeFetch('players/squads', { team: numId });
  const players = raw[0]?.players || [];
  return players.map(p => ({ name: p.name, position: p.position, number: p.number, age: p.age }));
}

async function getFixture(id) {
  if (!hasKey()) return null;
  const numId = String(id).replace('apf_', '');
  const raw   = await safeFetch('fixtures', { id: numId });
  return raw[0] ? normalise(raw[0]) : null;
}

async function getFixtureStats(id) {
  if (!hasKey()) return null;
  const numId = String(id).replace('apf_', '');
  const raw   = await safeFetch('fixtures/statistics', { fixture: numId });
  const result = {};
  raw.forEach(team => {
    result[team.team.name] = {};
    team.statistics.forEach(s => { result[team.team.name][s.type] = s.value; });
  });
  return Object.keys(result).length ? result : null;
}

async function getFixtureEvents(id) {
  const numId = String(id).replace('apf_', '');
  return safeFetch('fixtures/events', { fixture: numId });
}

async function getFixtureLineups(id) {
  const numId = String(id).replace('apf_', '');
  return safeFetch('fixtures/lineups', { fixture: numId });
}

async function getFixturePlayers(id) {
  const numId = String(id).replace('apf_', '');
  return safeFetch('fixtures/players', { fixture: numId });
}

// ── STANDINGS ────────────────────────────────────────
async function getStandings(leagueCode) {
  if (!hasKey()) return null;
  const leagueId = LEAGUES[leagueCode];
  if (!leagueId) return null;
  const raw = await safeFetch('standings', { league: leagueId, season: SEASON });
  return raw[0] || null;
}

// ── TEAMS ────────────────────────────────────────────
async function getTeamInfo(teamId) {
  const numId = String(teamId).replace('apf_t_', '');
  const raw   = await safeFetch('teams', { id: numId });
  if (!raw[0]) return null;
  return {
    id: teamId,
    name: raw[0].team.name,
    logo: raw[0].team.logo,
    country: raw[0].team.country,
    founded: raw[0].team.founded,
    venue: raw[0].venue.name,
    city: raw[0].venue.city,
    capacity: raw[0].venue.capacity
  };
}

async function getSquad(teamId) {
  const numId = String(teamId).replace('apf_t_', '');
  const raw   = await safeFetch('players/squads', { team: numId });
  if (!raw[0]) return [];
  return raw[0].players.map(p => ({
    id: p.id,
    name: p.name,
    age: p.age,
    number: p.number,
    position: p.position,
    photo: p.photo
  }));
}

async function getTeamFixtures(teamId, last = 10, next = 10) {
  const numId = String(teamId).replace('apf_t_', '');
  const [past, upcoming] = await Promise.all([
    safeFetch('fixtures', { team: numId, last, season: SEASON }),
    safeFetch('fixtures', { team: numId, next, season: SEASON })
  ]);
  return [...past, ...upcoming].map(normalise);
}

async function getTeamStats(teamId, leagueCode) {
  if (!hasKey()) return null;
  const numId    = String(teamId).replace('apf_t_', '');
  const leagueId = LEAGUES[leagueCode];
  if (!leagueId) return null;
  const raw = await safeFetch('teams/statistics', { team: numId, league: leagueId, season: SEASON });
  return raw[0] || null;
}

// ── PLAYERS ──────────────────────────────────────────
async function getTopScorers(leagueCode) {
  if (!hasKey()) return [];
  const leagueId = LEAGUES[leagueCode];
  if (!leagueId) return [];
  return safeFetch('players/topscorers', { league: leagueId, season: SEASON });
}

async function getPlayerStats(playerId) {
  const raw = await safeFetch('players', { id: playerId, season: SEASON });
  return raw[0] || null;
}

// ── H2H ──────────────────────────────────────────────
async function getH2H(team1Id, team2Id) {
  if (!hasKey()) return [];
  const id1 = String(team1Id).replace('apf_t_', '');
  const id2 = String(team2Id).replace('apf_t_', '');
  const raw = await safeFetch('fixtures/headtohead', { h2h: id1 + '-' + id2, last: 10 });
  return raw.map(normalise);
}

// ── PREDICTIONS ──────────────────────────────────────
async function getPredictions(fixtureId) {
  if (!hasKey()) return null;
  const numId = String(fixtureId).replace('apf_', '');
  const raw   = await safeFetch('predictions', { fixture: numId });
  if (!raw[0]) return null;
  const p = raw[0].predictions;
  return {
    winner:     raw[0].predictions?.winner?.name || null,
    advice:     p?.advice   || null,
    underOver:  p?.under_over || null,
    percent: {
      home: parseInt(p?.percent?.home) || null,
      draw: parseInt(p?.percent?.draw) || null,
      away: parseInt(p?.percent?.away) || null,
    },
    goals: { home: p?.goals?.home, away: p?.goals?.away },
    comparison: raw[0].comparison || null,
  };
}

// ── INJURIES ─────────────────────────────────────────
async function getInjuries(leagueCode) {
  if (!hasKey()) return [];
  const leagueId = LEAGUES[leagueCode];
  if (!leagueId) return [];
  return safeFetch('injuries', { league: leagueId, season: SEASON });
}

// Current injuries / unavailable players for a single team (national or club).
// Used by the availability criterion — missing key players lower expected goals.
async function getTeamInjuries(teamId) {
  if (!hasKey()) return [];
  const numId = String(teamId).replace('apf_t_', '');
  const raw = await safeFetch('injuries', { team: numId, season: SEASON });
  return (raw || [])
    .map(i => ({
      id: i.player?.id || null,
      name: i.player?.name,
      reason: i.player?.reason || i.reason || i.type || 'Unavailable',
      type: i.player?.type || i.type || null,
    }))
    .filter(p => p.name);
}

export default {
  hasKey, LEAGUES, SEASON, normalise,
  getLiveFixtures, getTodayFixtures, getUpcomingFixtures,
  getRecentFixtures, getLeagueSeasonFixtures, getTeamRecentForm, getSquadList, getFixture,
  getFixtureStats, getFixtureEvents, getFixtureLineups, getFixturePlayers,
  getStandings, getTeamInfo, getTeamStats, getSquad, getTeamFixtures,
  getTopScorers, getPlayerStats,
  getH2H, getPredictions, getInjuries, getTeamInjuries,
};
