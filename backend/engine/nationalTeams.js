// ─── NATIONAL TEAM STRENGTH (World Cup engine) ──────────────────────
// National teams have no club-season stats, so the standard engine can't
// derive attack/defense from league standings. Instead we derive expected
// goals from World Football Elo ratings, handle NEUTRAL venues (only the
// 3 hosts — USA / Canada / Mexico — get a home edge), and feed the result
// straight into the Dixon-Coles Poisson core (generateProbabilities).
//
// The Elo table is a snapshot (source: eloratings.net, ~2026). Relative
// strength is what matters; values are refined as tournament results arrive.

import { generateProbabilities } from './poissonCore.js';

// World Football Elo snapshot (eloratings.net, ~2026) — all 48 qualified
// nations + a few likely qualifiers. Anchored to real Elo where available,
// FIFA-rank-interpolated otherwise. Relative strength is what drives predictions.
const STRENGTH = {
  Spain: 2155, Argentina: 2113, France: 2062, England: 2020, Brazil: 1988,
  Portugal: 1984, Netherlands: 1944, Croatia: 1930, Germany: 1922, Morocco: 1900,
  Uruguay: 1892, Colombia: 1888, Switzerland: 1885, Senegal: 1879, Italy: 1872,
  Belgium: 1866, Mexico: 1840, USA: 1815, Japan: 1810, Ecuador: 1805,
  Denmark: 1790, Iran: 1780, Austria: 1772, Nigeria: 1768, 'South Korea': 1762,
  Egypt: 1755, Australia: 1748, Algeria: 1742, 'Ivory Coast': 1730, Norway: 1728,
  'Bosnia & Herzegovina': 1720, Paraguay: 1715, Canada: 1712, Sweden: 1705, Tunisia: 1690,
  Scotland: 1685, 'Czech Republic': 1680, Czechia: 1680, Cameroon: 1672, Panama: 1665,
  Qatar: 1640, 'South Africa': 1635, 'DR Congo': 1632, Uzbekistan: 1625, 'Saudi Arabia': 1612,
  Ghana: 1605, Iraq: 1585, Jordan: 1565, 'Cape Verde': 1545, 'Costa Rica': 1660,
  Curacao: 1490, Haiti: 1465, 'New Zealand': 1455,
};

const DEFAULT_ELO    = 1640;   // unknown / weakest qualifiers
const WC_AVG_GOALS   = 1.35;   // goals per team per match (recent WCs ≈ 2.7 total)
const GOAL_SCALE     = 700;    // Elo→goals sensitivity (higher = flatter)
const HOST_ELO_BOOST = 60;     // host nations get a modest home edge
const MARKET_WEIGHT  = 0.35;   // how much bookmaker odds nudge the Elo model
const HOSTS = new Set(['usa', 'united states', 'canada', 'mexico']);

const norm = (s) => String(s || '').toLowerCase()
  .replace(/\b(fc|national team|the)\b/g, '').replace(/[^a-z]/g, '').trim();

const STRENGTH_NORM = {};
for (const [k, v] of Object.entries(STRENGTH)) STRENGTH_NORM[norm(k)] = v;

export function getElo(name) {
  const n = norm(name);
  if (!n) return DEFAULT_ELO;
  if (STRENGTH_NORM[n] != null) return STRENGTH_NORM[n];
  for (const [k, v] of Object.entries(STRENGTH_NORM)) {
    if (k && (k.includes(n) || n.includes(k))) return v;
  }
  return DEFAULT_ELO;
}

const isHost = (name) => HOSTS.has(String(name || '').toLowerCase().trim());

/**
 * Full pre-match prediction for a World Cup match, from national-team Elo.
 * Returns the same shape as the Poisson core, enriched with strength metadata.
 */
export function predictWorldCupMatch(homeName, awayName, marketProbs = null) {
  const homeElo = getElo(homeName);
  const awayElo = getElo(awayName);
  const homeAdv = isHost(homeName) ? HOST_ELO_BOOST : 0;   // neutral unless host nation
  const dr = (homeElo + homeAdv) - awayElo;

  const lambdaHome = clamp(WC_AVG_GOALS * Math.exp(dr / GOAL_SCALE), 0.25, 4.5);
  const lambdaAway = clamp(WC_AVG_GOALS * Math.exp(-dr / GOAL_SCALE), 0.25, 4.5);

  const result = generateProbabilities(lambdaHome, lambdaAway, -0.08);
  const modelProbs = { ...result.probabilities };

  // Blend a modest, sharp market signal (great for low-data international football)
  // and surface the model-vs-market value edge — the core product feature.
  let probabilities = modelProbs;
  let valueEdges = null;
  if (marketProbs && Number.isFinite(marketProbs.home)) {
    const W = MARKET_WEIGHT;
    let h = (1 - W) * modelProbs.home + W * marketProbs.home;
    let d = (1 - W) * modelProbs.draw + W * marketProbs.draw;
    let a = (1 - W) * modelProbs.away + W * marketProbs.away;
    const s = (h + d + a) || 1;
    probabilities = { home: r1(h / s * 100), draw: r1(d / s * 100), away: r1(a / s * 100) };
    valueEdges = {
      home: r1(modelProbs.home - marketProbs.home),
      draw: r1(modelProbs.draw - marketProbs.draw),
      away: r1(modelProbs.away - marketProbs.away),
    };
  }

  const { home, draw, away } = probabilities;
  const bestPick = (home >= draw && home >= away) ? { name: `${homeName} win`, probability: home }
    : (away >= draw) ? { name: `${awayName} win`, probability: away }
    : { name: 'Draw', probability: draw };

  return {
    ...result,
    probabilities,
    model: marketProbs ? 'wc-elo-market-v1' : 'wc-elo-dixon-coles-v1',
    bestPick,
    modelProbs,
    marketProbs: marketProbs || null,
    valueEdges,
    nationalStrength: {
      homeElo, awayElo,
      neutral: homeAdv === 0,
      lambdaHome: round(lambdaHome),
      lambdaAway: round(lambdaAway),
    },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v) { return Math.round(v * 100) / 100; }
function r1(v) { return parseFloat(Number(v).toFixed(1)); }

export default { getElo, predictWorldCupMatch };
