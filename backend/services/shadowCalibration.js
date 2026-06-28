// ─── SHADOW CALIBRATION MAP (cached) ────────────────────────────────────────
// Builds the per-band calibration map from our OWN scored outcomes, on the PURE
// model probabilities (features.modelProbs) — the same basis the offline
// backtest used, where recalibration cut the pure model's ECE roughly in half.
// Cached (rebuilt every few hours); gated on CALIBRATION_MAP_SHADOW. Returns
// null until there are enough scored matches to calibrate honestly.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { buildCalibrationMap } from '../engine/calibrationMap.js';
import { fanbrainFlags } from '../config/fanbrainFlags.js';

const TTL_MS = 6 * 3600_000;
const MIN_SAMPLES = 20;
let _map = null, _at = 0;

export async function getShadowCalibrationMap() {
  if (!fanbrainFlags.calibrationMap() || !isDbAvailable()) return null;
  if (_map && Date.now() - _at < TTL_MS) return _map;
  try {
    const r = await safeQuery(
      `SELECT features, actual_result FROM predictions
        WHERE model_version = 'wc-elo-market-v1'
          AND actual_result IS NOT NULL AND features IS NOT NULL`);
    const samples = [];
    for (const row of r?.rows || []) {
      const f = typeof row.features === 'string' ? safeParse(row.features) : row.features;
      const m = f?.modelProbs;
      if (!m || !Number.isFinite(Number(m.home))) continue;
      const pick = (m.home >= m.draw && m.home >= m.away) ? 'HOME' : (m.away >= m.draw ? 'AWAY' : 'DRAW');
      const p = Math.max(m.home, m.draw, m.away) / 100;
      samples.push({ p, hit: pick === String(row.actual_result).toUpperCase() ? 1 : 0 });
    }
    if (samples.length < MIN_SAMPLES) return null;
    _map = buildCalibrationMap(samples);
    _at = Date.now();
    return _map;
  } catch (e) {
    console.warn('[shadowCalibration] build failed (ignored):', e.message);
    return null;
  }
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
export function _resetShadowCalCache() { _map = null; _at = 0; }

export default { getShadowCalibrationMap };
