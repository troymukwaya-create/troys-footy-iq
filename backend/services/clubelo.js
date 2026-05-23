// ─── CLUBELO SERVICE ─────────────────────────────────────────────────
// Free public Elo ratings for European clubs. CSV API, no auth required.
// Source: http://clubelo.com — licensed for free use including commercial.
// Updates daily. Cached 24h.
//
// Endpoints used:
//   GET /{YYYY-MM-DD}   → full ranking on a date (CSV)
//   GET /{ClubName}     → single club's historical Elo (CSV)
//
// PRODUCTION-SAFE: ClubElo permits commercial use. No tripwire here.

import axios from 'axios';
import cache from './cache.js';

const BASE_URL = 'http://api.clubelo.com';
const CACHE_TTL = 24 * 60 * 60; // 24h — Elo updates daily

const http = axios.create({ baseURL: BASE_URL, timeout: 10_000 });

// ─── Minimal CSV parser (ClubElo format has no quotes/escapes) ──────
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = cells[i]; });
    return row;
  });
}

// ─── Team name normalization (football-data.org → ClubElo) ──────────
// ClubElo uses short forms like "Man City", "Bayern", "Paris SG".
// Strip common suffixes/prefixes; then apply manual overrides.
const NAME_OVERRIDES = {
  // English
  'arsenal fc':                  'Arsenal',
  'manchester city fc':          'Man City',
  'manchester united fc':        'Man United',
  'liverpool fc':                'Liverpool',
  'chelsea fc':                  'Chelsea',
  'tottenham hotspur fc':        'Tottenham',
  'aston villa fc':              'Aston Villa',
  'newcastle united fc':         'Newcastle',
  'west ham united fc':          'West Ham',
  'brighton & hove albion fc':   'Brighton',
  'nottingham forest fc':        "Forest",
  'wolverhampton wanderers fc':  'Wolves',
  // Spanish
  'fc barcelona':                'Barcelona',
  'real madrid cf':              'Real Madrid',
  'club atlético de madrid':     'Atletico',
  'sevilla fc':                  'Sevilla',
  // German
  'fc bayern münchen':           'Bayern',
  'borussia dortmund':           'Dortmund',
  'rb leipzig':                  'RB Leipzig',
  'bayer 04 leverkusen':         'Leverkusen',
  // Italian
  'fc internazionale milano':    'Inter',
  'ac milan':                    'Milan',
  'juventus fc':                 'Juventus',
  'as roma':                     'Roma',
  'ssc napoli':                  'Napoli',
  // French
  'paris saint-germain fc':      'Paris SG',
  'olympique de marseille':      'Marseille',
  'olympique lyonnais':          'Lyon',
  // Brazilian
  'sociedade esportiva palmeiras': 'Palmeiras',
  'clube de regatas do flamengo':  'Flamengo',
  'são paulo fc':                  'Sao Paulo',
};

export function normalizeTeamName(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  // Generic cleanup: drop common suffixes/prefixes
  return name
    .replace(/^FC\s+/i, '')
    .replace(/\s+(FC|CF|SC|AFC|AC|SSC|AS|CR|SE)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Get the full Elo ranking on a given date.
 * Returns a Map<clubName, { rank, country, level, elo, from, to }>.
 */
export async function getRankingOnDate(date) {
  const cacheKey = `clubelo_ranking_${date}`;
  return cache.getOrSet(cacheKey, async () => {
    try {
      const res = await http.get(`/${date}`);
      const rows = parseCsv(res.data);
      const map = new Map();
      for (const r of rows) {
        if (!r.Club) continue;
        map.set(r.Club, {
          rank: r.Rank === 'None' ? null : parseInt(r.Rank, 10),
          country: r.Country,
          level: parseInt(r.Level, 10),
          elo: parseFloat(r.Elo),
          from: r.From,
          to: r.To,
        });
      }
      return map;
    } catch (err) {
      console.warn(`[clubelo] ranking fetch failed for ${date}:`, err.message);
      return new Map();
    }
  }, CACHE_TTL);
}

/**
 * Get one club's Elo on a specific date (or latest known if not in window).
 */
export async function getClubEloOnDate(rawName, date) {
  const club = normalizeTeamName(rawName);
  if (!club) return null;
  const ranking = await getRankingOnDate(date);
  const entry = ranking.get(club);
  return entry ? entry.elo : null;
}

/**
 * Get both teams' Elo and the delta — designed for pre-match feature wiring.
 * Returns { home, away, diff, asOf } or nulls if either team isn't found.
 */
export async function getMatchElo(homeName, awayName, date) {
  const ranking = await getRankingOnDate(date);
  const homeKey = normalizeTeamName(homeName);
  const awayKey = normalizeTeamName(awayName);
  const home = ranking.get(homeKey)?.elo ?? null;
  const away = ranking.get(awayKey)?.elo ?? null;
  return {
    home,
    away,
    diff: (home != null && away != null) ? home - away : null,
    asOf: date,
    homeName: homeKey,
    awayName: awayKey,
    matched: home != null && away != null,
  };
}

/**
 * Get a club's full historical Elo trajectory (one row per date range).
 * Useful for backtesting and trend analysis.
 */
export async function getClubHistory(rawName) {
  const club = normalizeTeamName(rawName);
  if (!club) return [];
  const cacheKey = `clubelo_history_${club}`;
  return cache.getOrSet(cacheKey, async () => {
    try {
      const res = await http.get(`/${encodeURIComponent(club)}`);
      const rows = parseCsv(res.data);
      return rows.map(r => ({
        from: r.From,
        to: r.To,
        elo: parseFloat(r.Elo),
        country: r.Country,
        level: parseInt(r.Level, 10),
      }));
    } catch (err) {
      console.warn(`[clubelo] history fetch failed for ${club}:`, err.message);
      return [];
    }
  }, CACHE_TTL);
}

export default {
  getRankingOnDate,
  getClubEloOnDate,
  getMatchElo,
  getClubHistory,
  normalizeTeamName,
};
