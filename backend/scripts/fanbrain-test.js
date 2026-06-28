#!/usr/bin/env node
// ─── FAN-BRAIN SHADOW TEST SUITE ────────────────────────────────────────────
// Unit tests for the pure shadow modules + the scored-model byte-identical
// regression interlock. Exits non-zero on any failure (CI/deploy gate).
//   node scripts/fanbrain-test.js

import { runScoredModelRegression } from './regression-scored-model.js';
import { fanbrainFlags, fanbrainFlagState } from '../config/fanbrainFlags.js';
import {
  numOrNull, xgResult, proxyXg, deservedResult, ewma, styleVector, mergeStyle, steamDrift,
} from '../engine/perception.js';
import { applyKnockoutRegime, inflateDraw, pHomeAdvances, KNOCKOUT_DEFAULTS } from '../engine/knockoutRegime.js';
import { betaShrink, isotonic, buildCalibrationMap, applyCalibration, ece, calibrate } from '../engine/calibrationMap.js';
import { softResult, updatePerfElo, deservedUpdate, resetPerfElo } from '../engine/perfElo.js';
import { updateElo } from '../engine/eloLearning.js';
import { buildShadowPredictions, SHADOW_VERSIONS } from '../engine/shadowPredict.js';
import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import { boundedNudge, buildScoutPrompt, parseScoutResponse, assertMarketBlind } from '../services/scout.js';

let pass = 0, fail = 0; const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

console.log('\n═══ FAN-BRAIN SHADOW TEST SUITE ═══\n');

// ── 1. SAFETY: scored model byte-identical ──
console.log('Safety interlock (scored model frozen):');
{
  const r = runScoredModelRegression(() => {});
  check('scored-model regression byte-identical', r.fail === 0, r.fails.join(' | '));
}

// ── 2. Flags default OFF (no-op when unset) ──
console.log('\nFlags (default OFF):');
const st = fanbrainFlagState();
check('all shadow flags default false', Object.values(st).every(v => v === false), JSON.stringify(st));
check('anyShadowOn() false by default', fanbrainFlags.anyShadowOn() === false);

// ── 3. PERCEIVE: deserved result + parsing ──
console.log('\nPerception:');
check('numOrNull parses "55%"', numOrNull('55%') === 55);
check('numOrNull null on garbage', numOrNull('n/a') === null && numOrNull(null) === null);
check('xgResult symmetric at 0 margin = 0.5', xgResult(1.0, 1.0) === 0.5);
check('xgResult clamps a blowout to 0.85', xgResult(3.0, 0.2) === 0.85);
check('xgResult clamps the other way to 0.15', xgResult(0.2, 3.0) === 0.15);
check('xgResult null when xG missing', xgResult(null, 1) === null);
check('proxyXg weights SoT > off-target', near(proxyXg(5, 12), 5 * 0.30 + 7 * 0.04));
check('deservedResult prefers xG', deservedResult({ xg: 2 }, { xg: 1 })?.source === 'xg');
check('deservedResult falls back to shots proxy', deservedResult({ shotsOnTarget: 6, shotsTotal: 15 }, { shotsOnTarget: 1, shotsTotal: 6 })?.source === 'shots-proxy');
check('deservedResult null on sparse fixture', deservedResult({}, {}) === null);
check('ewma blends', near(ewma(1, 2, 0.5), 1.5));
check('ewma seeds when prev null', ewma(null, 2) === 2);
{
  const v = styleVector({ shotsTotal: 15, corners: 6, fouls: 9, xg: 2.0, shotsOnTarget: 6 });
  check('styleVector returns 4 axes in range', v && near(v.tempo, 21 / 25) && v.chanceQuality > 0 && v.chanceQuality <= 1 && v.pressIntensity === 0.5);
  check('styleVector null on empty stats', styleVector({}) === null);
  check('mergeStyle EWMAs onto a prior', near(mergeStyle({ tempo: 0.4 }, { tempo: 0.8 }, 0.5).tempo, 0.6));
}
{
  const d = steamDrift([{ implied: { home: 40, draw: 30, away: 30 } }, { implied: { home: 45, draw: 28, away: 27 } }]);
  check('steamDrift reports the move', d && d.home === 5 && d.draw === -2 && d.away === -3);
  check('steamDrift null with <2 snapshots', steamDrift([{}]) === null);
}

// ── 4. REASON: knockout regime ──
console.log('\nKnockout regime (no-op default == live behaviour):');
{
  // Live formula: pHomeInExtra = clamp(0.5 + (exp-0.5)*0.5, 0.35, 0.65)
  //               advance.home = home + draw*pHomeInExtra
  const out = applyKnockoutRegime({ home: 40, draw: 30, away: 30, exp: 0.6 }, {});
  const pHome = 0.5 + (0.6 - 0.5) * 0.5;           // 0.55
  check('default advance matches live formula', out.advance.home === parseFloat((40 + 30 * pHome).toFixed(1)) && out.advance.away === parseFloat((30 + 30 * (1 - pHome)).toFixed(1)), JSON.stringify(out.advance));
  check('default leaves the 1X2 untouched', out.probabilities.home === 40 && out.probabilities.draw === 30 && out.probabilities.away === 30);
  check('pen lean clamps to [0.35,0.65]', pHomeAdvances({ exp: 0.99 }, {}) === 0.65 && pHomeAdvances({ exp: 0.01 }, {}) === 0.35);
  check('KNOCKOUT_DEFAULTS reproduce live (kappa 1, penShrink .5, no ET)', KNOCKOUT_DEFAULTS.kappa === 1 && KNOCKOUT_DEFAULTS.penShrink === 0.5 && KNOCKOUT_DEFAULTS.useEtPoisson === false);
}
{
  // kappa > 1 inflates the draw and renormalises home/away (sum preserved)
  const inf = inflateDraw({ home: 40, draw: 20, away: 40 }, 1.5);
  check('inflateDraw raises draw, keeps sum=100', near(inf.draw, 30) && near(inf.home + inf.draw + inf.away, 100) && near(inf.home, 35));
  check('inflateDraw kappa=1 is identity', JSON.stringify(inflateDraw({ home: 40, draw: 30, away: 30 }, 1)) === JSON.stringify({ home: 40, draw: 30, away: 30 }));
}
{
  // ET second-Poisson path uses the injected Poisson fn (still bounded 0..1)
  const fakePoisson = (lh, la) => ({ home: 30, draw: 45, away: 25 });
  const p = pHomeAdvances({ exp: 0.6, lambdaHome: 1.5, lambdaAway: 1.2 }, { useEtPoisson: true, poissonFn: fakePoisson });
  check('ET-Poisson advance in [0,1]', p >= 0 && p <= 1 && p !== 0.55);
}

// ── 5. LEARN: calibration map ──
console.log('\nCalibration map (confidence-only, monotone):');
check('betaShrink shrinks toward prior', near(betaShrink(8, 10, 0.5, 6), 11 / 16));
{
  const iso = isotonic([0.6, 0.4, 0.7], [1, 1, 1]);
  check('isotonic is monotone non-decreasing', iso.every((x, i) => i === 0 || x >= iso[i - 1] - 1e-9), JSON.stringify(iso));
  check('isotonic pools the violators (0.6,0.4 → 0.5,0.5)', near(iso[0], 0.5) && near(iso[1], 0.5) && near(iso[2], 0.7));
}
{
  // Under-confident band: picks at ~0.55 actually win ~0.75 → map lifts confidence.
  const samples = Array.from({ length: 40 }, (_, i) => ({ p: 0.55, hit: i % 4 !== 0 ? 1 : 0 })); // 75%
  const map = buildCalibrationMap(samples);
  check('map lifts an under-confident band', calibrate(0.55, map) > 0.55, `calibrate(0.55)=${calibrate(0.55, map)}`);
  check('calibrate is a no-op with no map', calibrate(0.55, null) === 0.55);
  const out = applyCalibration({ home: 55, draw: 25, away: 20 }, map);
  check('applyCalibration cannot reorder the favourite', out.home >= out.draw && out.home >= out.away, JSON.stringify(out));
  check('applyCalibration keeps the sum ~100', near(out.home + out.draw + out.away, 100, 0.3), JSON.stringify(out));
}
// perfectly calibrated: p=0.6 wins exactly 3/5 ⇒ |0.6−0.6| = 0
check('ece ≈ 0 on perfectly-calibrated samples', ece([{ p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }, { p: 0.6, hit: 0 }, { p: 0.6, hit: 0 }]) < 0.001);
// and detects miscalibration: p=0.6 but wins 5/5 ⇒ ECE ≈ 0.4
check('ece flags an over-confident gap', ece([{ p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }, { p: 0.6, hit: 1 }]) > 0.3);

// ── 6. REMEMBER: perfElo soft-result ladder (pure math) ──
console.log('\nPerfElo (deserved-result ladder):');
check('softResult blends real + xG result 50/50', near(softResult(1, 0.85), 0.925) && near(softResult(0, 0.5), 0.25));
check('softResult null on bad input', softResult(1, null) === null);
{
  // K=60 (world_cup), expected=0.5 (even), g=goalMultiplier(2)=1.5
  //   shift = 60·1.5·(0.925−0.5) = 38.25 → 38
  const u = updatePerfElo(1900, 1900, { resultPerf: 0.925, xgGoalDiff: 2, neutral: true, importance: 'world_cup' });
  check('updatePerfElo applies K·g·(perf−expected), zero-sum', u.homeElo === 1938 && u.awayElo === 1862, JSON.stringify(u));
  check('updatePerfElo null on bad result', updatePerfElo(1900, 1900, { resultPerf: NaN }) === null);
}
{
  // THE perfElo lesson: home out-creates 2.4–0.6 xG but LOSES 0–1 to a deflection.
  // Plain Elo punishes the loss in full; perfElo should punish far less.
  const plain = updateElo(1900, 1900, 0, 1, { neutral: true, importance: 'world_cup' }); // delta ≈ −30
  const out = deservedUpdate(1900, 1900, { goals: 0, xg: 2.4 }, { goals: 1, xg: 0.6 });    // delta ≈ −7
  check('deservedUpdate punishes a deserved-but-unlucky loss far less than plain Elo', out && out.delta > plain.delta + 10, `perf ${out?.delta} vs plain ${plain.delta}`);
  check('deservedUpdate tags the xG source', out?.source === 'xg');
  check('deservedUpdate falls back to a shots proxy', deservedUpdate(1900, 1900, { goals: 1, shotsOnTarget: 7, shotsTotal: 16 }, { goals: 1, shotsOnTarget: 1, shotsTotal: 5 })?.source === 'shots-proxy');
  check('deservedUpdate null with no xG and no shots (teach nothing)', deservedUpdate(1900, 1900, { goals: 1 }, { goals: 0 }) === null);
}

// ── 7. PREDICT: shadow assembler (market-blind, flag-gated) ──
console.log('\nShadow assembler (market-blind, default-off):');
check('no shadow tracks when all flags off', buildShadowPredictions({ homeName: 'Brazil', awayName: 'Serbia', ctx: {} }).length === 0);
check('SHADOW_VERSIONS enumerates 5 tracks', SHADOW_VERSIONS.length === 5);
{
  process.env.PERF_ELO_SHADOW = 'true';
  try {
    resetPerfElo(); // no learned overrides ⇒ perfElo seeds from the base ladder
    const tracks = buildShadowPredictions({ homeName: 'Brazil', awayName: 'Serbia', ctx: {} });
    const versions = tracks.map(t => t.version);
    check('perfElo flag emits perf-elo + combined fanbrain tracks', versions.includes('wc-perf-elo-shadow') && versions.includes('wc-fanbrain-shadow'), versions.join(','));
    const perf = tracks.find(t => t.version === 'wc-perf-elo-shadow');
    const pure = predictWorldCupMatch('Brazil', 'Serbia', null, {}); // no market, no opts
    check('shadow probs are MARKET-BLIND (== pure model, never the 0.60 blend)', near(perf.probabilities.home, pure.probabilities.home) && near(perf.probabilities.away, pure.probabilities.away), JSON.stringify(perf.probabilities));
    check('shadow probs sum ~100', near(perf.probabilities.home + perf.probabilities.draw + perf.probabilities.away, 100, 0.6));
  } finally {
    delete process.env.PERF_ELO_SHADOW;
    resetPerfElo();
  }
}

// ── 8. REASON: scout (market-blind, bounded) ──
console.log('\nScout (market-blind λ nudge):');
check('boundedNudge clamps to [0.85,1.15]', boundedNudge(1.5) === 1.15 && boundedNudge(0.5) === 0.85 && boundedNudge(1.07) === 1.07);
check('boundedNudge → 1.0 (no change) on garbage', boundedNudge('x') === 1 && boundedNudge(null) === 1);
{
  const prompt = buildScoutPrompt('Brazil', 'Serbia', { knockout: true, venueCity: 'Dallas', homeForm: { form: 'WWDWL' } });
  check('scout prompt is MARKET-BLIND (no odds/market/line)', assertMarketBlind(prompt) && !/odds|market|implied|price/i.test(prompt), prompt.slice(0, 60));
  check('scout prompt carries the matchup + stage', prompt.includes('Brazil') && prompt.includes('Serbia') && /KNOCKOUT/.test(prompt));
}
check('assertMarketBlind catches a leaked market term', assertMarketBlind('home implied prob 55% from the market') === false);
check('parseScoutResponse clamps + extracts', (() => { const r = parseScoutResponse('{"home":1.4,"away":0.7,"why":"high press"}'); return r && r.home === 1.15 && r.away === 0.85 && r.why === 'high press'; })());
check('parseScoutResponse null on garbage', parseScoutResponse('not json') === null && parseScoutResponse('{}') === null);

// ── Result ──
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('   - ' + f)); process.exit(1); }
