// ─── CALIBRATION MAP (shadow, LEARN) ────────────────────────────────────────
// The ledger measured the model is UNDER-confident in the 50-70% band (it wins
// those more often than it says). This learns a per-band remap from our own
// scored predictions and corrects only the CONFIDENCE — never the ranking:
//   1. Bin the picked-outcome probability into bands.
//   2. Beta-Bernoulli shrink each band's empirical hit-rate toward the band
//      centre (low-sample bands barely move — no overfitting the WC's small n).
//   3. Isotonic (pool-adjacent-violators) so the map is monotone non-decreasing.
//   4. Apply: remap the FAVOURED outcome's confidence, scale the two losers to
//      keep the sum at 100. Because the map is monotone and only the top prob is
//      remapped upward/downward while staying the max, the favoured outcome can
//      never be reordered — this provably changes confidence, not the pick.
//
// Shadow-graded on ECE; promote only if ECE improves AND Brier does not regress.
// Pure + dependency-free. CALIBRATION_MAP_SHADOW.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Default bands over the picked-outcome probability (0..1).
export const DEFAULT_BANDS = Object.freeze([0.0, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0]);

/** Beta-Bernoulli posterior mean — shrink hits/n toward `prior` with `strength` pseudo-counts. */
export function betaShrink(hits, n, prior = 0.5, strength = 6) {
  return (hits + strength * prior) / (n + strength);
}

/** Pool-Adjacent-Violators: smallest monotone non-decreasing fit (weighted). */
export function isotonic(values, weights) {
  const w = weights || values.map(() => 1);
  const blocks = []; // { sumWV, sumW, len }
  for (let i = 0; i < values.length; i++) {
    let blk = { sumWV: values[i] * w[i], sumW: w[i], len: 1 };
    // merge with the block below while it violates monotonicity (its mean > ours)
    while (blocks.length && (blocks[blocks.length - 1].sumWV / blocks[blocks.length - 1].sumW) > (blk.sumWV / blk.sumW)) {
      const prev = blocks.pop();
      blk = { sumWV: prev.sumWV + blk.sumWV, sumW: prev.sumW + blk.sumW, len: prev.len + blk.len };
    }
    blocks.push(blk);
  }
  const out = [];
  for (const b of blocks) { const mean = b.sumWV / b.sumW; for (let k = 0; k < b.len; k++) out.push(mean); }
  return out;
}

/** Find the band index for a probability p (0..1). */
function bandOf(p, bands) {
  for (let i = 0; i < bands.length - 1; i++) if (p >= bands[i] && p < bands[i + 1]) return i;
  return bands.length - 2;
}

/**
 * Build a calibration map from scored samples.
 * samples: [{ p: pickedOutcomeProb 0..1, hit: 0|1 }]
 * Returns { bands, calibrated:[per-band rate], ece, n:[per-band counts] }.
 */
export function buildCalibrationMap(samples = [], opts = {}) {
  const { bands = DEFAULT_BANDS, strength = 6 } = opts;
  const nb = bands.length - 1;
  const hits = new Array(nb).fill(0), counts = new Array(nb).fill(0);
  for (const s of samples) {
    const p = Number(s?.p);
    if (!Number.isFinite(p)) continue;
    const b = bandOf(clamp(p, 0, 0.999999), bands);
    counts[b]++; hits[b] += s.hit ? 1 : 0;
  }
  // Shrink toward the band centre (a sensible prior: a 55-60% pick should win ~57%).
  const centre = (i) => (bands[i] + bands[i + 1]) / 2;
  const raw = counts.map((n, i) => betaShrink(hits[i], n, centre(i), strength));
  const calibrated = isotonic(raw, counts.map(c => c + 1)); // +1 so empty bands still anchor
  return { bands, calibrated, n: counts, ece: ece(samples, bands) };
}

/** Expected Calibration Error of raw samples (confidence vs accuracy per band). */
export function ece(samples = [], bands = DEFAULT_BANDS) {
  const nb = bands.length - 1;
  const sum = new Array(nb).fill(0), hit = new Array(nb).fill(0), cnt = new Array(nb).fill(0);
  let total = 0;
  for (const s of samples) {
    const p = Number(s?.p); if (!Number.isFinite(p)) continue;
    const b = bandOf(clamp(p, 0, 0.999999), bands);
    sum[b] += p; hit[b] += s.hit ? 1 : 0; cnt[b]++; total++;
  }
  if (!total) return null;
  let e = 0;
  for (let i = 0; i < nb; i++) if (cnt[i]) e += (cnt[i] / total) * Math.abs(sum[i] / cnt[i] - hit[i] / cnt[i]);
  return parseFloat(e.toFixed(4));
}

/** Remap a single picked-outcome probability (0..1) through the calibrated map. */
export function calibrate(p, map) {
  if (!map?.calibrated?.length) return p;
  const b = bandOf(clamp(p, 0, 0.999999), map.bands);
  return clamp(map.calibrated[b], 0.02, 0.98);
}

/**
 * Apply calibration to a full 1X2 (percentages). Remaps ONLY the favoured
 * outcome's confidence; the two losers are scaled to keep the sum at 100, so the
 * favourite stays the favourite — confidence changes, the pick cannot.
 */
export function applyCalibration({ home, draw, away }, map) {
  if (!map?.calibrated?.length) return { home, draw, away };
  const arr = [['home', home], ['draw', draw], ['away', away]].sort((a, b) => b[1] - a[1]);
  const [topK, topP] = arr[0];
  const newTop = clamp(calibrate(topP / 100, map) * 100, 0, 100);
  const restOld = 100 - topP;
  const scale = restOld > 0 ? (100 - newTop) / restOld : 0;
  const out = { home, draw, away };
  out[topK] = parseFloat(newTop.toFixed(1));
  for (const [k, v] of arr.slice(1)) out[k] = parseFloat((v * scale).toFixed(1));
  return out;
}

export default { DEFAULT_BANDS, betaShrink, isotonic, buildCalibrationMap, ece, calibrate, applyCalibration };
