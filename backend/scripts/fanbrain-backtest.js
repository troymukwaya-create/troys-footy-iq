#!/usr/bin/env node
// ─── FAN-BRAIN vs CURRENT MODEL — OFFLINE BACKTEST (READ-ONLY) ───────────────
// Answers Troy's question: does the fan-brain beat the published model, or do
// they complement each other? This is strictly READ-ONLY — it SELECTs the
// already-scored WC predictions and re-scores them offline. It never writes,
// never flips a flag, never touches the live path.
//
// What it can judge NOW (the data is in the stored rows):
//   • the LEARN layer — per-band calibration remap of the CURRENT model,
//     evaluated LEAVE-ONE-OUT (map built without the test match) so the gain is
//     honest out-of-sample, not a fit-and-test illusion.
//   • current pure-model vs blended(0.60) vs market-only Brier (the ledger view).
// What it CANNOT judge from stored rows (needs shadow-running — said plainly):
//   • perfElo (needs the per-match xG history to rebuild the ladder),
//   • scout (needs the Claude calls), knockoutRegime (needs knockout volume).
//
// Run:  node scripts/fanbrain-backtest.js            (uses .env DATABASE_URL)
//   or  node scripts/fanbrain-backtest.js --file sample.json   (offline sample)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
import { buildCalibrationMap, applyCalibration, ece, DEFAULT_BANDS } from '../engine/calibrationMap.js';

const OUTCOMES = ['HOME', 'DRAW', 'AWAY'];
function brier1x2(probsPct, actual) {
  if (!probsPct || !Number.isFinite(probsPct.home)) return null;
  const p = { HOME: probsPct.home / 100, DRAW: probsPct.draw / 100, AWAY: probsPct.away / 100 };
  let s = 0;
  for (const o of OUTCOMES) s += (p[o] - (actual === o ? 1 : 0)) ** 2;
  return s / 3;
}
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pick = (p) => (p.home >= p.draw && p.home >= p.away) ? 'HOME' : (p.away >= p.draw ? 'AWAY' : 'DRAW');
const pickProb = (p) => Math.max(p.home, p.draw, p.away) / 100;

// ── Load scored samples: { modelProbs, marketProbs, blendedProbs, actual } ──
async function loadFromDb() {
  const { safeQuery, isDbAvailable } = await import('../db/index.js');
  if (!isDbAvailable || !isDbAvailable()) return null;
  // READ-ONLY. Every locked, scored WC row carries the model + market probs.
  const r = await safeQuery(
    `SELECT prob_home, prob_draw, prob_away, features, actual_result
       FROM predictions
      WHERE model_version = 'wc-elo-market-v1'
        AND actual_result IS NOT NULL AND features IS NOT NULL`
  ).catch((e) => { console.error('[backtest] DB read failed:', e.message); return null; });
  if (!r?.rows?.length) return null;
  const out = [];
  for (const row of r.rows) {
    const f = typeof row.features === 'string' ? safeParse(row.features) : row.features;
    const m = f?.modelProbs, k = f?.marketProbs;
    if (!m || !Number.isFinite(m.home)) continue;
    out.push({
      modelProbs: m,
      marketProbs: k && Number.isFinite(k.home) ? k : null,
      blendedProbs: { home: Number(row.prob_home), draw: Number(row.prob_draw), away: Number(row.prob_away) },
      actual: String(row.actual_result).toUpperCase(),
    });
  }
  return out;
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// ── The comparison ──
function compare(samples) {
  const n = samples.length;
  const blend = (m, k, w = 0.6) => {
    if (!k) return m;
    let h = (1 - w) * m.home + w * k.home, d = (1 - w) * m.draw + w * k.draw, a = (1 - w) * m.away + w * k.away;
    const s = (h + d + a) / 100; return { home: h / s, draw: d / s, away: a / s };
  };

  const pureB = [], blendB = [], marketB = [], calB = [];
  // Leave-one-out calibration: for each i, build the map from every OTHER match.
  const samplePts = samples.map(s => ({ p: pickProb(s.modelProbs), hit: pick(s.modelProbs) === s.actual ? 1 : 0 }));
  const calProbsAll = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    pureB.push(brier1x2(s.modelProbs, s.actual));
    blendB.push(brier1x2(s.blendedProbs, s.actual));
    if (s.marketProbs) marketB.push(brier1x2(s.marketProbs, s.actual));
    const loo = samplePts.filter((_, j) => j !== i);
    const map = buildCalibrationMap(loo);
    const cal = applyCalibration(s.modelProbs, map);
    calProbsAll.push({ p: pickProb(cal), hit: pick(cal) === s.actual ? 1 : 0 });
    calB.push(brier1x2(cal, s.actual));
  }

  // ECE per band (50-70 is the known under-confidence zone), model vs calibrated.
  const eceBands = [0, 0.40, 0.50, 0.70, 1.0];
  const eceModel = ece(samplePts, eceBands);
  const eceCal = ece(calProbsAll, eceBands);

  // Ensemble idea: equal-weight current-blended + calibrated-model.
  const ensB = samples.map((s, i) => {
    const cal = applyCalibration(s.modelProbs, buildCalibrationMap(samplePts.filter((_, j) => j !== i)));
    const e = { home: (s.blendedProbs.home + cal.home) / 2, draw: (s.blendedProbs.draw + cal.draw) / 2, away: (s.blendedProbs.away + cal.away) / 2 };
    return brier1x2(e, s.actual);
  });

  return {
    n,
    brier: {
      pureModel: round(mean(pureB)),
      blended_published: round(mean(blendB)),
      marketOnly: marketB.length ? round(mean(marketB)) : null,
      modelPlusCalibration: round(mean(calB)),
      blendPlusCalibration_ensemble: round(mean(ensB)),
    },
    ece: { model: eceModel, calibrated: eceCal },
    deltas: {
      calibration_vs_pure: round(mean(pureB) - mean(calB)),
      ensemble_vs_blended: round(mean(blendB) - mean(ensB)),
    },
  };
}
function round(v) { return v == null ? null : parseFloat(Number(v).toFixed(4)); }

// ── Main ──
(async () => {
  const fileArg = process.argv.indexOf('--file');
  let samples = null;
  if (fileArg > -1 && process.argv[fileArg + 1]) {
    samples = JSON.parse(fs.readFileSync(process.argv[fileArg + 1], 'utf8'));
  } else {
    samples = await loadFromDb();
  }
  if (!samples?.length) {
    console.error('No scored samples (DB unavailable or empty). Run with --file <sample.json>, or against a DB with scored wc-elo-market-v1 rows.');
    process.exit(2);
  }
  const r = compare(samples);
  console.log('\n═══ FAN-BRAIN vs CURRENT MODEL — BACKTEST (n=' + r.n + ', read-only) ═══\n');
  console.log('Brier (lower = better):');
  console.log(`  current pure model ............ ${r.brier.pureModel}`);
  console.log(`  current BLENDED (published) ... ${r.brier.blended_published}`);
  console.log(`  market only ................... ${r.brier.marketOnly}`);
  console.log(`  model + calibration (LOO) ..... ${r.brier.modelPlusCalibration}`);
  console.log(`  blend + calibration (ensemble)  ${r.brier.blendPlusCalibration_ensemble}`);
  console.log(`\nECE (0=perfectly calibrated): model ${r.ece.model}  →  calibrated ${r.ece.calibrated}`);
  console.log(`\nΔ Brier — calibration vs pure: ${r.deltas.calibration_vs_pure}  (positive = calibration better)`);
  console.log(`Δ Brier — ensemble vs blended: ${r.deltas.ensemble_vs_blended}  (positive = ensemble better)`);
  const verdict = r.deltas.calibration_vs_pure > 0.002 || r.deltas.ensemble_vs_blended > 0.002
    ? 'COMPLEMENTARY — recalibration/ensemble improves the published model out-of-sample.'
    : (r.deltas.calibration_vs_pure < -0.002 ? 'WORSE — calibration hurts on this sample (likely too few matches).'
      : 'NEUTRAL — no clear movement yet (small sample; revisit as more matches score).');
  console.log(`\nVerdict (calibration/ensemble layer): ${verdict}`);
  console.log('NOTE: perfElo / scout / knockoutRegime are NOT in this backtest — their inputs');
  console.log('(per-match xG history, Claude calls, knockout volume) are not in the stored rows.');
  console.log('They need the shadow tracks running to be judged. This backtest covers the LEARN layer.\n');
  process.exit(0);
})();
