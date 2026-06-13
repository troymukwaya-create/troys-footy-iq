// ─── MATCH-DAY WEATHER (Open-Meteo, free, no API key) ───────────────
// A US-summer World Cup means afternoon kickoffs in real heat — Dallas,
// Houston, Monterrey, Miami can sit at 35°C+ at kickoff. Heat and humidity
// measurably suppress tempo and goals. This adds a small, BOUNDED signal:
// at apparent temperature ≥30°C both teams' expected goals scale down 2%
// (≥35°C: 4%), and never more. Below 30°C it is a strict no-op.
//
// Open-Meteo needs no key for non-commercial use and returns an hourly
// forecast up to 16 days out — so matches further than that simply get no
// weather (the T-10 final lock, when it matters, always has it). The effect
// flows through the SHARED prediction path so card = page = locked row.

import cacheService from './cache.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_S = 3600;            // 1h per venue+hour
const HEAT_C = 30;                   // apparent-temp threshold for a goal dampener
const STRONG_HEAT_C = 35;            // stronger dampener above this

// ─── WC 2026 stadiums → lat/lon ─────────────────────────────────────
// Keyed by lowercase fragments of the venue name AND host city, so a
// fixture's `venue` ("SoFi Stadium") or `city` ("Inglewood"/"Los Angeles")
// both resolve. Coordinates are the stadium's, good enough for a forecast.
const VENUES = [
  { match: ['mercedes-benz', 'atlanta'],                 lat: 33.7554, lon: -84.4008 },
  { match: ['gillette', 'foxborough', 'boston'],          lat: 42.0909, lon: -71.2643 },
  { match: ['at&t stadium', 'arlington', 'dallas'],       lat: 32.7473, lon: -97.0945 },
  { match: ['akron', 'guadalajara', 'zapopan'],           lat: 20.6817, lon: -103.4626 },
  { match: ['nrg', 'houston'],                            lat: 29.6847, lon: -95.4107 },
  { match: ['arrowhead', 'kansas city'],                  lat: 39.0489, lon: -94.4839 },
  { match: ['sofi', 'inglewood', 'los angeles'],          lat: 33.9535, lon: -118.3392 },
  { match: ['azteca', 'mexico city', 'ciudad de m'],      lat: 19.3029, lon: -99.1505 },
  { match: ['hard rock', 'miami', 'gardens'],             lat: 25.9580, lon: -80.2389 },
  { match: ['bbva', 'monterrey', 'guadalupe'],            lat: 25.6691, lon: -100.2444 },
  { match: ['metlife', 'east rutherford', 'new york', 'new jersey'], lat: 40.8135, lon: -74.0745 },
  { match: ['lincoln financial', 'philadelphia'],         lat: 39.9008, lon: -75.1675 },
  { match: ["levi's", 'levis', 'santa clara', 'san francisco', 'bay area'], lat: 37.4030, lon: -121.9700 },
  { match: ['lumen', 'seattle'],                          lat: 47.5952, lon: -122.3316 },
  { match: ['bmo field', 'toronto'],                      lat: 43.6332, lon: -79.4185 },
  { match: ['bc place', 'vancouver'],                     lat: 49.2768, lon: -123.1119 },
];

function resolveVenue(match) {
  const hay = `${match?.venue || ''} ${match?.city || ''}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const v of VENUES) {
    if (v.match.some(frag => hay.includes(frag))) return v;
  }
  return null;
}

/**
 * Bounded expected-goals multiplier from apparent (feels-like) temperature.
 * Pure + dependency-free → unit-tested. No-op below 30°C; floors at 0.96.
 */
export function weatherGoalFactor(feelsLikeC) {
  const t = Number(feelsLikeC);
  if (!Number.isFinite(t)) return 1.0;
  if (t >= STRONG_HEAT_C) return 0.96;
  if (t >= HEAT_C) return 0.98;
  return 1.0;
}

/**
 * Forecast for a match's venue at kickoff hour, or null (→ no-op) when the
 * venue is unknown or the kickoff is beyond the forecast horizon. NEVER
 * throws — weather is strictly additive.
 * @returns {null | {tempC, feelsLike, humidity, precipProb, factor, effect}}
 */
export async function getMatchWeather(match) {
  const venue = resolveVenue(match);
  if (!venue || !match?.date) return null;

  const ko = new Date(match.date);
  if (Number.isNaN(ko.getTime())) return null;
  const hourIso = `${ko.toISOString().slice(0, 13)}:00`;   // 'YYYY-MM-DDTHH:00'

  const ck = `weather_${venue.lat}_${venue.lon}_${hourIso}`;
  const cached = cacheService.get(ck);
  if (cached !== undefined && cached !== null) return cached;

  try {
    const axios = (await import('axios')).default;
    const res = await axios.get(FORECAST_URL, {
      params: {
        latitude: venue.lat,
        longitude: venue.lon,
        hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability',
        forecast_days: 16,
        timezone: 'UTC',
      },
      timeout: 8000,
    });
    const h = res.data?.hourly;
    if (!h?.time?.length) return null;
    const idx = h.time.indexOf(hourIso);
    if (idx === -1) return null;   // kickoff beyond the 16-day horizon → no-op

    const tempC = num(h.temperature_2m?.[idx]);
    const feelsLike = num(h.apparent_temperature?.[idx]) ?? tempC;
    const factor = weatherGoalFactor(feelsLike);
    const result = {
      tempC,
      feelsLike,
      humidity: num(h.relative_humidity_2m?.[idx]),
      precipProb: num(h.precipitation_probability?.[idx]),
      factor,
      effect: factor < 1 ? parseFloat(((factor - 1) * 100).toFixed(0)) : 0, // e.g. -2 / -4 (%)
    };
    cacheService.set(ck, result, CACHE_TTL_S);
    return result;
  } catch {
    return null;   // forecast unavailable → prediction runs unchanged
  }
}

/** Human-readable note for the analysis page, or null. */
export function weatherNote(w) {
  if (!w || w.factor >= 1) return null;
  return `${Math.round(w.feelsLike)}°C at kickoff — heat slows tempo`;
}

function num(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }

export default { weatherGoalFactor, getMatchWeather, weatherNote };
