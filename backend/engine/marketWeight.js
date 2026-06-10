// ─── LEARNED WC MARKET WEIGHT ───────────────────────────────────────
// How much the bookmaker consensus pulls the Elo model in the published
// World Cup probability. Was hardcoded at 0.35 — outside every learning
// loop. Now: starts at an evidence-based default (markets beat ratings
// models for internationals), then LEARNS daily from our own evaluated
// WC predictions by grid-searching the blend weight that minimizes the
// realized Brier score. The optimizer only moves the weight once there
// are >= MIN_SAMPLES scored matches; the value is clamped so neither the
// model nor the market can be silenced entirely.
//
// Sync read path (predictWorldCupMatch is sync) + async refresh/optimize
// wired into the scheduler.

import { safeQuery, isDbAvailable } from '../db/index.js';

const SETTING_KEY = 'wc_market_weight';
const DEFAULT_WEIGHT = clamp(Number(process.env.WC_MARKET_WEIGHT) || 0.60, 0.35, 0.85);
const MIN_SAMPLES = 25;     // scored WC matches before learning kicks in
const GRID_MIN = 0.30, GRID_MAX = 0.90, GRID_STEP = 0.05;

let current = DEFAULT_WEIGHT;
let meta = { source: 'default', samples: 0 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Current blend weight (sync — used inside predictWorldCupMatch). */
export function getWcMarketWeight() { return current; }

/** Provenance of the current weight (for /health, dashboard, explainer). */
export function getWcMarketWeightMeta() { return { weight: current, ...meta }; }

/** Load the learned weight from engine_settings (boot + after optimize). */
export async function refreshWcMarketWeight() {
  if (!isDbAvailable()) return current;
  const r = await safeQuery(`SELECT value FROM engine_settings WHERE key = $1`, [SETTING_KEY]);
  const v = r?.rows?.[0]?.value;
  if (v && Number.isFinite(Number(v.weight))) {
    current = clamp(Number(v.weight), 0.35, 0.85);
    meta = { source: 'learned', samples: v.samples || 0, brier: v.brier, updatedAt: v.updatedAt };
  }
  return current;
}

/**
 * Learn the blend weight from our own scored WC predictions.
 * Each locked prediction stores features.modelProbs + features.marketProbs,
 * so every candidate weight can be re-simulated against actual results.
 */
export async function optimizeWcMarketWeight() {
  if (!isDbAvailable()) return { optimized: false, reason: 'db unavailable' };

  const r = await safeQuery(`
    SELECT features, actual_result
    FROM predictions
    WHERE model_version = 'wc-elo-market-v1'
      AND actual_result IS NOT NULL
      AND features IS NOT NULL
    ORDER BY evaluated_at DESC
    LIMIT 200
  `);

  const samples = [];
  for (const row of r?.rows || []) {
    const f = typeof row.features === 'string' ? safeParse(row.features) : row.features;
    const m = f?.modelProbs, k = f?.marketProbs;
    if (!m || !k || !Number.isFinite(m.home) || !Number.isFinite(k.home)) continue;
    samples.push({ model: m, market: k, actual: row.actual_result });
  }

  if (samples.length < MIN_SAMPLES) {
    return { optimized: false, reason: `insufficient samples (${samples.length}/${MIN_SAMPLES})`, samples: samples.length };
  }

  let bestW = DEFAULT_WEIGHT, bestBrier = Infinity;
  for (let w = GRID_MIN; w <= GRID_MAX + 1e-9; w += GRID_STEP) {
    const b = avgBrier(samples, w);
    if (b < bestBrier) { bestBrier = b; bestW = w; }
  }
  bestW = clamp(parseFloat(bestW.toFixed(2)), 0.35, 0.85);

  const value = {
    weight: bestW,
    samples: samples.length,
    brier: parseFloat(bestBrier.toFixed(4)),
    updatedAt: new Date().toISOString(),
  };
  await safeQuery(
    `INSERT INTO engine_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SETTING_KEY, JSON.stringify(value)]
  );
  current = bestW;
  meta = { source: 'learned', samples: samples.length, brier: value.brier, updatedAt: value.updatedAt };
  console.log(`[marketWeight] Learned WC market weight: ${bestW} (brier ${value.brier} over ${samples.length} matches)`);
  return { optimized: true, weight: bestW, brier: value.brier, samples: samples.length };
}

function avgBrier(samples, w) {
  let total = 0;
  for (const s of samples) {
    let h = (1 - w) * s.model.home + w * s.market.home;
    let d = (1 - w) * s.model.draw + w * s.market.draw;
    let a = (1 - w) * s.model.away + w * s.market.away;
    const sum = h + d + a;
    h /= sum; d /= sum; a /= sum;
    const yH = s.actual === 'HOME' ? 1 : 0;
    const yD = s.actual === 'DRAW' ? 1 : 0;
    const yA = s.actual === 'AWAY' ? 1 : 0;
    total += ((h - yH) ** 2 + (d - yD) ** 2 + (a - yA) ** 2) / 3;
  }
  return total / samples.length;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default { getWcMarketWeight, getWcMarketWeightMeta, refreshWcMarketWeight, optimizeWcMarketWeight };
