// ─── THE ODDS API SOURCE ────────────────────────────────────────────
// Fetches soccer odds from The Odds API (the-odds-api.com) and normalizes
// them into Oddyessa's market shape ({ markets: { '1X2', 'OU25' }, bestOdds }).
// Preferred odds source when THE_ODDS_API_KEY is set; oddsService falls back
// to API-Sports otherwise. Docs: https://the-odds-api.com/liveapi/guides/v4/

import cache from '../cache.js';

const BASE = 'https://api.the-odds-api.com/v4';
const REGIONS = process.env.THE_ODDS_API_REGIONS || 'uk,eu';
// Default to the World Cup feed + the generic "upcoming" soccer feed.
const SPORT_KEYS = (process.env.THE_ODDS_API_SPORTS || 'soccer_fifa_world_cup,upcoming')
  .split(',').map(s => s.trim()).filter(Boolean);

export function hasKey() {
  return (process.env.THE_ODDS_API_KEY || '').length > 10;
}

// Normalize a team / club name for cross-provider matching.
const norm = (s) => String(s || '').toLowerCase()
  .replace(/\b(fc|cf|afc|sc|ac|club|football|the)\b/g, '')
  .replace(/[^a-z0-9]/g, '').trim();

async function fetchSport(sportKey) {
  const axios = (await import('axios')).default;
  const res = await axios.get(`${BASE}/sports/${sportKey}/odds`, {
    params: {
      apiKey: process.env.THE_ODDS_API_KEY,
      regions: REGIONS,
      markets: 'h2h,totals',
      oddsFormat: 'decimal',
      dateFormat: 'iso',
    },
    timeout: 15000,
  });
  return Array.isArray(res.data) ? res.data : [];
}

// Public: all upcoming soccer odds, normalized + cached (5 min).
export async function getEvents() {
  if (!hasKey()) return [];
  const cacheKey = 'theoddsapi_events';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const events = [];
  for (const sport of SPORT_KEYS) {
    try {
      for (const ev of await fetchSport(sport)) events.push(normalizeEvent(ev));
    } catch (err) {
      console.warn(`[ODDS:theoddsapi] ${sport} fetch failed:`, err.response?.status || err.message);
    }
  }
  cache.set(cacheKey, events, 300);
  return events;
}

// Find the odds event matching a fixture by team names.
export function matchEvent(events, homeName, awayName) {
  const h = norm(homeName), a = norm(awayName);
  if (!h || !a) return null;
  return events.find(e => {
    const eh = norm(e.home), ea = norm(e.away);
    return (eh.includes(h) || h.includes(eh)) && (ea.includes(a) || a.includes(ea));
  }) || null;
}

function normalizeEvent(ev) {
  const markets = {};
  for (const bk of (ev.bookmakers || [])) {
    for (const mk of (bk.markets || [])) {
      if (mk.key === 'h2h')   addOutcomes(markets, '1X2',  'Match Winner',    bk.title, mk.outcomes, ev);
      else if (mk.key === 'totals') addOutcomes(markets, 'OU25', 'Over/Under 2.5', bk.title, mk.outcomes, ev, 2.5);
    }
  }
  for (const [key, m] of Object.entries(markets)) {
    // Consensus is computed over ALL books (before the display slice):
    // best-of-book prices are outliers and made a terrible market signal.
    if (key === '1X2') m.consensusProbs = consensus1X2(m.bookmakers);
    m.bookmakers = m.bookmakers.slice(0, 5);
    m.bestOdds = bestOdds(m.bookmakers);
  }
  return {
    fixtureId: `toa_${ev.id}`,
    home: ev.home_team,
    away: ev.away_team,
    commenceTime: ev.commence_time,
    markets,
    fetchedAt: new Date().toISOString(),
    source: 'theoddsapi',
    bookmakerCount: (ev.bookmakers || []).length,
  };
}

function addOutcomes(markets, key, label, book, outcomes, ev, point) {
  const mapped = (outcomes || [])
    .filter(o => point == null || o.point === point)
    .map(o => ({
      name: outcomeName(o, key, ev),
      odd: parseFloat(o.price) || 0,
      impliedProbability: o.price ? parseFloat((100 / parseFloat(o.price)).toFixed(1)) : 0,
    }))
    .filter(o => o.odd > 0 && o.name);
  if (mapped.length === 0) return;
  if (!markets[key]) markets[key] = { market: key, label, bookmakers: [] };
  markets[key].bookmakers.push({ name: book, isTop: true, outcomes: mapped });
}

function outcomeName(o, key, ev) {
  if (key === '1X2') {
    if (o.name === ev.home_team) return 'Home';
    if (o.name === ev.away_team) return 'Away';
    if (/draw/i.test(o.name)) return 'Draw';
    return null;
  }
  if (key === 'OU25') {
    if (/over/i.test(o.name))  return 'Over 2.5';
    if (/under/i.test(o.name)) return 'Under 2.5';
  }
  return null;
}

// ─── Market consensus ───────────────────────────────────────────────
// The market SIGNAL for the model blend. Per bookmaker: de-vig that book's
// own 1X2 trio (normalize to 100%), then take the MEDIAN per outcome across
// books and renormalize. Pinnacle — the sharpest book — is used directly
// when present. Best-of-book odds remain for the *displayed* value prices,
// but never as the probability signal.
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function devigBook(bk) {
  const get = (n) => bk.outcomes.find(o => o.name === n)?.odd;
  const h = get('Home'), d = get('Draw'), a = get('Away');
  if (!(h > 1 && d > 1 && a > 1)) return null;
  const rh = 1 / h, rd = 1 / d, ra = 1 / a;
  const s = rh + rd + ra;
  return { home: rh / s, draw: rd / s, away: ra / s };
}

function consensus1X2(bookmakers = []) {
  const pinnacle = bookmakers.find(b => /pinnacle/i.test(b.name));
  if (pinnacle) {
    const p = devigBook(pinnacle);
    if (p) return toPct(p, 'pinnacle', 1);
  }
  const devigged = bookmakers.map(devigBook).filter(Boolean);
  if (!devigged.length) return null;
  const m = {
    home: median(devigged.map(p => p.home)),
    draw: median(devigged.map(p => p.draw)),
    away: median(devigged.map(p => p.away)),
  };
  const s = m.home + m.draw + m.away;
  return toPct({ home: m.home / s, draw: m.draw / s, away: m.away / s }, 'median', devigged.length);
}

function toPct(p, source, books) {
  return {
    home: parseFloat((p.home * 100).toFixed(1)),
    draw: parseFloat((p.draw * 100).toFixed(1)),
    away: parseFloat((p.away * 100).toFixed(1)),
    source, books,
  };
}

// De-margined 1X2 market probabilities {home, draw, away} (percent) from a
// normalized odds object, or null if unavailable. Prefers the cross-book
// consensus; falls back to de-vigged best odds for odds objects from other
// sources (API-Sports path) that carry no consensus.
export function impliedProbs(odds) {
  const consensus = odds?.markets?.['1X2']?.consensusProbs;
  if (consensus) return consensus;

  const best = odds?.markets?.['1X2']?.bestOdds;
  if (!best || !best.Home || !best.Draw || !best.Away) return null;
  const raw = {
    home: best.Home.impliedProbability,
    draw: best.Draw.impliedProbability,
    away: best.Away.impliedProbability,
  };
  const s = raw.home + raw.draw + raw.away;
  if (!(s > 0)) return null;
  return {
    home: parseFloat((raw.home / s * 100).toFixed(1)),
    draw: parseFloat((raw.draw / s * 100).toFixed(1)),
    away: parseFloat((raw.away / s * 100).toFixed(1)),
    source: 'best-odds-fallback',
  };
}

function bestOdds(bookmakers) {
  const best = {};
  for (const bk of bookmakers) for (const o of bk.outcomes) {
    if (!best[o.name] || o.odd > best[o.name].odd) {
      best[o.name] = { odd: o.odd, bookmaker: bk.name, impliedProbability: o.impliedProbability };
    }
  }
  return best;
}

export default { hasKey, getEvents, matchEvent };
