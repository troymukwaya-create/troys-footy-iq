#!/usr/bin/env node
// ─── ODDYESSA ENGINE STRENGTH TEST ──────────────────────────────────
// Run weekly (or in CI): `node scripts/engine-test.js`
// Exits non-zero if any check fails, so it can gate a deploy.
//
// Verifies the things skeptics care about:
//   1. Confidence is NOT cherry-picked from a near-certain market.
//   2. Confidence is LOW for close matches and only rises for real favourites.
//   3. Confidence VARIES across matches (not "everything is 80%").
//   4. The model-maturity cap is actually enforced.
//   5. Probabilities are coherent (sum ~100, peak with strength gap).

import {
  computeExpectedGoals, generateProbabilities,
  computeConfidence, selectHeadlinePick,
} from '../services/probabilityEngine.js';
import { updateElo, expectedScore, goalMultiplier } from '../engine/eloLearning.js';
import { restDayFactor, availabilityFactor, adjustExpectedGoals } from '../engine/matchContext.js';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${detail ? '— ' + detail : ''}`); }
}

// Helper: build a market list the way the engine does, to test headline pick.
function markets(p) {
  const g = generateProbabilities(p.lh, p.la);
  return [
    { name: 'Home Win', probability: g.probabilities.home },
    { name: 'Draw', probability: g.probabilities.draw },
    { name: 'Away Win', probability: g.probabilities.away },
    { name: 'Over 0.5 Goals', probability: g.overUnder.over05 },
    { name: 'Over 1.5 Goals', probability: g.overUnder.over15 },
    { name: 'BTTS Yes', probability: g.btts.yes },
    { name: 'Double Chance 1X', probability: +(g.probabilities.home + g.probabilities.draw).toFixed(1) },
  ].sort((a, b) => b.probability - a.probability);
}

console.log('\n═══ ODDYESSA ENGINE STRENGTH TEST ═══\n');

// ── 1. Confidence on a coin-flip match is LOW ──
console.log('Confidence honesty:');
const evenC = computeConfidence({ home: 34, draw: 33, away: 33 });
check('coin-flip match → LOW tier', evenC.tier === 'LOW', `got ${evenC.score} (${evenC.tier})`);
check('coin-flip confidence < 15', evenC.score < 15, `got ${evenC.score}`);

// ── 2. Moderate favourite → modest, heavy favourite → higher (monotonic) ──
const modC = computeConfidence({ home: 50, draw: 27, away: 23 });
const bigC = computeConfidence({ home: 78, draw: 14, away: 8 });
check('confidence rises with favourite strength', bigC.score > modC.score && modC.score > evenC.score,
  `${evenC.score} < ${modC.score} < ${bigC.score}`);
check('moderate favourite is not "high"', modC.score < 50, `got ${modC.score}`);

// ── 3. Maturity cap is enforced ──
console.log('\nMaturity cap:');
const capped = computeConfidence({ home: 90, draw: 7, away: 3 }, { maxConfidence: 45 });
check('blowout capped at cold-start 45', capped.score <= 45 && capped.capped === true, `got ${capped.score}`);
const uncapped = computeConfidence({ home: 90, draw: 7, away: 3 }, { maxConfidence: 100 });
check('cap lifts when mature', uncapped.score > 45, `got ${uncapped.score}`);

// ── 4. Headline pick is never a near-certain throwaway ──
console.log('\nHeadline pick:');
for (const m of [{ lh: 2.1, la: 1.0 }, { lh: 1.3, la: 1.2 }, { lh: 0.9, la: 1.8 }]) {
  const pick = selectHeadlinePick(markets(m));
  check(`pick for λ ${m.lh}/${m.la} excludes Over 0.5 & ≤90%`,
    pick && pick.name !== 'Over 0.5 Goals' && pick.probability <= 90,
    `got ${pick?.name} ${pick?.probability}%`);
}

// ── 5. Confidence VARIES across a slate (the skeptic test) ──
console.log('\nVariation across matches (the skeptic test):');
const slate = [
  { home: 34, draw: 33, away: 33 }, { home: 45, draw: 28, away: 27 },
  { home: 55, draw: 25, away: 20 }, { home: 68, draw: 20, away: 12 },
  { home: 80, draw: 13, away: 7 },
];
const scores = slate.map(p => computeConfidence(p).score);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
const sd = Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length);
check('confidence spread is real (σ > 10)', sd > 10, `scores=[${scores.join(', ')}] σ=${sd.toFixed(1)}`);
check('not all high', scores.filter(s => s >= 70).length <= 1, `scores=[${scores.join(', ')}]`);

// ── 6. Probability coherence ──
console.log('\nProbability coherence:');
const { lambdaHome, lambdaAway } = computeExpectedGoals(
  { isValid: true, avgGoalsFor: 2.1, avgGoalsAgainst: 0.9 },
  { isValid: true, avgGoalsFor: 1.0, avgGoalsAgainst: 1.6 });
const probs = generateProbabilities(lambdaHome, lambdaAway).probabilities;
const sum = probs.home + probs.draw + probs.away;
check('1X2 sums to ~100', Math.abs(sum - 100) < 1.0, `sum=${sum}`);
check('stronger team favoured', probs.home > probs.away, `${probs.home} vs ${probs.away}`);

// ── 7. Elo learning (learns from current games) ──
console.log('\nElo learning:');
const eqDraw = updateElo(1800, 1800, 1, 1, { neutral: true });
check('draw between equals barely moves Elo', Math.abs(eqDraw.delta) <= 1, `delta ${eqDraw.delta}`);
const upset = updateElo(1600, 2000, 2, 0, { neutral: true, importance: 'qualifier' });
check('underdog win raises underdog, zero-sum', upset.homeElo > 1600 && upset.awayElo < 2000 && (upset.homeElo - 1600) === (2000 - upset.awayElo),
  `home +${upset.homeElo - 1600}, away ${upset.awayElo - 2000}`);
const bigWin = updateElo(1800, 1800, 4, 0, { neutral: true });
const smallWin = updateElo(1800, 1800, 1, 0, { neutral: true });
check('bigger margin → bigger Elo shift', bigWin.delta > smallWin.delta, `${bigWin.delta} > ${smallWin.delta}`);
check('home-field raises expected score', expectedScore(1800, 1800, false) > expectedScore(1800, 1800, true));
check('goal multiplier monotonic', goalMultiplier(1) < goalMultiplier(2) && goalMultiplier(2) < goalMultiplier(4));

// ── 8. Fatigue / availability criteria ──
console.log('\nFatigue & availability criteria:');
check('no context → no change', restDayFactor(null) === 1.0 && availabilityFactor({}) === 1.0);
check('back-to-back match → fatigue penalty', restDayFactor(2) < 1.0, `factor ${restDayFactor(2)}`);
check('normal rest → no penalty', restDayFactor(6) === 1.0);
check('key player out → lower output', availabilityFactor({ keyPlayersOut: 2 }) < availabilityFactor({ keyPlayersOut: 0 }));
const adj = adjustExpectedGoals(1.6, 1.4, { homeRestDays: 2, homeAvailability: { keyPlayersOut: 1 } });
check('tired/depleted home team scores less', adj.lambdaHome < 1.6 && adj.lambdaAway === 1.4, `λh ${adj.lambdaHome}`);
const noAdj = adjustExpectedGoals(1.6, 1.4, {});
check('empty context is a true no-op', noAdj.lambdaHome === 1.6 && noAdj.lambdaAway === 1.4 && noAdj.applied === false);

// ── Sample report (eyeball) ──
console.log('\n─── SAMPLE PREDICTIONS (cold-start cap = 45) ───');
const samples = [
  ['Even derby', { home: 35, draw: 33, away: 32 }],
  ['Slight home edge', { home: 48, draw: 28, away: 24 }],
  ['Clear favourite', { home: 66, draw: 21, away: 13 }],
  ['Mismatch', { home: 82, draw: 12, away: 6 }],
];
for (const [label, p] of samples) {
  const c = computeConfidence(p, { maxConfidence: 45 });
  console.log(`  ${label.padEnd(18)} → ${c.predictedOutcome.padEnd(5)} | confidence ${String(c.score).padStart(4)}% (${c.tier})`);
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
if (fail) { console.log('FAILED:', fails.join('; ')); process.exit(1); }
console.log('Engine confidence behaviour is honest. ✓\n');
process.exit(0);
