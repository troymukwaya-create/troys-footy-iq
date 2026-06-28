#!/usr/bin/env node
// ─── SCORED-MODEL BYTE-IDENTICAL REGRESSION ─────────────────────────────────
// SAFETY INTERLOCK for the Fan-Brain shadow build. The published, scored model
// `wc-elo-market-v1` and the FROZEN 0.60 market blend must stay byte-identical
// while shadow infrastructure is added. This freezes the exact output of
// predictWorldCupMatch() for six representative cases (favourite / even / mid /
// knockout-advance / host-altitude / form-blend) captured BEFORE the build, with
// the market weight frozen at 0.60. Any drift — including an accidental change to
// the PERCEIVE-layer form fields that flow into ctx — fails this test.
//
// Determinism: no DB (ELO_OVERRIDES empty → static snapshot) and the blend weight
// is frozen (marketWeight.js FROZEN=true), so the numbers are reproducible.
//
// Run standalone:  node scripts/regression-scored-model.js
// Or imported by   scripts/engine-test.js  (runScoredModelRegression()).

import { predictWorldCupMatch } from '../engine/nationalTeams.js';
import { getWcMarketWeight, isMarketWeightFrozen } from '../engine/marketWeight.js';

// Inputs — fixed market lines + ctx so the prediction is deterministic.
const CASES = [
  { name: 'fav',      home: 'Spain',     away: 'Curacao',  market: { home: 80, draw: 13, away: 7 },  ctx: {} },
  { name: 'even',     home: 'Argentina', away: 'Brazil',   market: { home: 38, draw: 30, away: 32 }, ctx: {} },
  { name: 'mid',      home: 'England',   away: 'Croatia',  market: { home: 50, draw: 28, away: 22 }, ctx: {} },
  { name: 'knockout', home: 'France',    away: 'Portugal', market: { home: 42, draw: 29, away: 29 }, ctx: { knockout: true } },
  { name: 'host-alt', home: 'Mexico',    away: 'Germany',  market: { home: 30, draw: 28, away: 42 }, ctx: { venueCity: 'Mexico City' } },
  { name: 'form',     home: 'England',   away: 'Croatia',  market: { home: 50, draw: 28, away: 22 }, ctx: {
      homeForm: { played: 5, avgGoalsFor: 2.0, avgGoalsAgainst: 0.8, recentResults: [{ opponent: 'Spain' }, { opponent: 'Italy' }, { opponent: 'Wales' }, { opponent: 'Serbia' }, { opponent: 'Denmark' }] },
      awayForm: { played: 5, avgGoalsFor: 1.2, avgGoalsAgainst: 1.4, recentResults: [{ opponent: 'Brazil' }, { opponent: 'Turkey' }, { opponent: 'Austria' }, { opponent: 'Poland' }, { opponent: 'Albania' }] },
    } },
];

// Frozen baseline — captured 2026-06-28, all flags OFF, W=0.60.
const BASELINE = {
  fav:      { probabilities: { home: 84,   draw: 10.9, away: 5.2 },  modelProbs: { home: 89.9, draw: 7.7,  away: 2.4 },  valueEdges: { home: 9.9,  draw: -5.3, away: -4.6 }, advance: null,                          lambdaHome: 3.49, lambdaAway: 0.52, model: 'wc-elo-market-v1' },
  even:     { probabilities: { home: 41.9, draw: 28.6, away: 29.5 }, modelProbs: { home: 47.7, draw: 26.6, away: 25.7 }, valueEdges: { home: 9.7,  draw: -3.4, away: -6.3 }, advance: null,                          lambdaHome: 1.61, lambdaAway: 1.13, model: 'wc-elo-market-v1' },
  mid:      { probabilities: { home: 47.7, draw: 27.7, away: 24.6 }, modelProbs: { home: 44.4, draw: 27.2, away: 28.5 }, valueEdges: { home: -5.6, draw: -0.8, away: 6.5 },  advance: null,                          lambdaHome: 1.54, lambdaAway: 1.19, model: 'wc-elo-market-v1' },
  knockout: { probabilities: { home: 42.5, draw: 28.3, away: 29.2 }, modelProbs: { home: 43.2, draw: 27.3, away: 29.5 }, valueEdges: { home: 1.2,  draw: -1.7, away: 0.5 },  advance: { home: 58.2, away: 41.8 },    lambdaHome: 1.51, lambdaAway: 1.21, model: 'wc-elo-market-v1' },
  'host-alt': { probabilities: { home: 32.6, draw: 27.9, away: 39.5 }, modelProbs: { home: 36.4, draw: 27.8, away: 35.8 }, valueEdges: { home: 6.4, draw: -0.2, away: -6.2 }, advance: null,                        lambdaHome: 1.36, lambdaAway: 1.34, model: 'wc-elo-market-v1' },
  form:     { probabilities: { home: 48.8, draw: 27.5, away: 23.7 }, modelProbs: { home: 47,   draw: 26.8, away: 26.2 }, valueEdges: { home: -3,   draw: -1.2, away: 4.2 },  advance: null,                          lambdaHome: 1.59, lambdaAway: 1.13, model: 'wc-elo-market-v1' },
};

function r1(v) { return parseFloat(Number(v).toFixed(1)); }
function actual(p) {
  return {
    probabilities: p.probabilities,
    modelProbs: { home: r1(p.modelProbs.home), draw: r1(p.modelProbs.draw), away: r1(p.modelProbs.away) },
    valueEdges: p.valueEdges,
    advance: p.advance,
    lambdaHome: p.nationalStrength.lambdaHome,
    lambdaAway: p.nationalStrength.lambdaAway,
    model: p.model,
  };
}

/** Returns { pass, fail, fails:[] } — fail>0 means the scored model drifted. */
export function runScoredModelRegression(log = () => {}) {
  let pass = 0, fail = 0;
  const fails = [];
  const eq = (name, a, b) => {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) { pass++; }
    else { fail++; fails.push(`${name}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
    log(`  ${ok ? '✓' : '✗'} regression[${name}]${ok ? '' : ` — drift: got ${JSON.stringify(a)} vs ${JSON.stringify(b)}`}`);
  };

  // Pre-condition: the blend MUST still be frozen at 0.60 — if someone unfreezes
  // it mid-tournament, this whole snapshot is invalid; fail loudly.
  eq('frozen', { frozen: isMarketWeightFrozen(), W: getWcMarketWeight() }, { frozen: true, W: 0.6 });

  for (const c of CASES) {
    const got = actual(predictWorldCupMatch(c.home, c.away, c.market, c.ctx));
    eq(c.name, got, BASELINE[c.name]);
  }
  return { pass, fail, fails };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n═══ SCORED-MODEL BYTE-IDENTICAL REGRESSION ═══\n');
  const { pass, fail, fails } = runScoredModelRegression((m) => console.log(m));
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach(f => console.log('   - ' + f)); process.exit(1); }
}
