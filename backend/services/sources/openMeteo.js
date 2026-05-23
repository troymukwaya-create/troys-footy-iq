// ─── OPEN-METEO WEATHER SERVICE ──────────────────────────────────────
//
// ⚠️  RESEARCH-ONLY — Open-Meteo's free tier explicitly prohibits commercial
//     use. Their terms (https://open-meteo.com/en/terms) state:
//        "You may only use the free API services for non-commercial purposes"
//     Commercial use includes "websites or apps that display advertisements"
//     and "integrating our service into commercial products."
//
// Use this module ONLY for:
//   - Model training / backtesting
//   - Research notebooks
//   - Offline feature engineering
//
// DO NOT use this module for live predictions once ads/affiliate go live.
// At that point: upgrade to Open-Meteo Standard (~€29/mo) or replace with a
// commercially-licensed weather API. See ../README.md.
//
// Free-tier limits: 600 calls/min, 5000 calls/hr, 10000 calls/day.
// ────────────────────────────────────────────────────────────────────

import axios from 'axios';
import cache from '../cache.js';

const BASE_URL = 'https://api.open-meteo.com/v1';
const CACHE_TTL = 6 * 60 * 60; // 6h — forecasts update a few times per day

const http = axios.create({ baseURL: BASE_URL, timeout: 10_000 });

/**
 * Fetch hourly weather for a venue around kickoff time.
 *
 * @param {number} lat        Stadium latitude
 * @param {number} lon        Stadium longitude
 * @param {string} kickoffIso ISO datetime of kickoff (e.g. "2026-06-11T19:00:00Z")
 * @returns {Promise<{tempC, precipMm, windKph, source} | null>}
 */
export async function getMatchWeather(lat, lon, kickoffIso) {
  if (lat == null || lon == null) return null;
  const date = kickoffIso?.slice(0, 10);
  if (!date) return null;

  const cacheKey = `openmeteo_${lat.toFixed(3)}_${lon.toFixed(3)}_${date}`;
  return cache.getOrSet(cacheKey, async () => {
    try {
      const res = await http.get('/forecast', {
        params: {
          latitude: lat,
          longitude: lon,
          hourly: 'temperature_2m,precipitation,wind_speed_10m',
          start_date: date,
          end_date: date,
        },
      });
      const h = res.data?.hourly;
      if (!h?.time?.length) return null;

      // Find the hour closest to kickoff
      const target = new Date(kickoffIso).getTime();
      let bestIdx = 0;
      let bestDelta = Infinity;
      for (let i = 0; i < h.time.length; i++) {
        const delta = Math.abs(new Date(h.time[i] + 'Z').getTime() - target);
        if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
      }

      return {
        tempC:    h.temperature_2m?.[bestIdx] ?? null,
        precipMm: h.precipitation?.[bestIdx] ?? null,
        windKph:  h.wind_speed_10m?.[bestIdx] ?? null,
        source: 'open-meteo (research-only)',
      };
    } catch (err) {
      console.warn(`[openMeteo] fetch failed (${lat},${lon},${date}):`, err.message);
      return null;
    }
  }, CACHE_TTL);
}

/**
 * Fetch historical weather for a venue on a past date. Used for backtesting.
 * Uses the archive endpoint (free for research).
 */
export async function getHistoricalWeather(lat, lon, isoDate) {
  if (lat == null || lon == null || !isoDate) return null;
  const date = isoDate.slice(0, 10);
  const cacheKey = `openmeteo_hist_${lat.toFixed(3)}_${lon.toFixed(3)}_${date}`;
  return cache.getOrSet(cacheKey, async () => {
    try {
      const res = await axios.get('https://archive-api.open-meteo.com/v1/archive', {
        params: {
          latitude: lat,
          longitude: lon,
          start_date: date,
          end_date: date,
          hourly: 'temperature_2m,precipitation,wind_speed_10m',
        },
        timeout: 10_000,
      });
      const h = res.data?.hourly;
      if (!h?.time?.length) return null;
      // Return midday reading as a daily summary
      const idx = Math.min(15, h.time.length - 1);
      return {
        tempC:    h.temperature_2m?.[idx] ?? null,
        precipMm: h.precipitation?.[idx] ?? null,
        windKph:  h.wind_speed_10m?.[idx] ?? null,
        source: 'open-meteo archive (research-only)',
      };
    } catch (err) {
      console.warn(`[openMeteo] historical fetch failed:`, err.message);
      return null;
    }
  }, CACHE_TTL);
}

export default { getMatchWeather, getHistoricalWeather };
