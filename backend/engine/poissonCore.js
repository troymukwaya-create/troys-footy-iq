// ─── BIVARIATE POISSON CORE ─────────────────────────────────────────
// Production-grade Poisson model with Dixon-Coles low-score correction
// and time-decay weighting. This is the statistical baseline (Layer 1).
//
// Reference: Dixon & Coles (1997) - "Modelling Association Football
// Scores and Inefficiencies in the Football Betting Market"

const MAX_GOALS = 8;

// ─── Memoized factorial ────────────────────────────────────────────
const _fc = [1, 1];
function factorial(n) {
  if (n < 0) return 1;
  if (_fc[n] !== undefined) return _fc[n];
  for (let i = _fc.length; i <= n; i++) _fc[i] = _fc[i - 1] * i;
  return _fc[n];
}

/**
 * Standard Poisson PMF: P(X=k) = (λ^k * e^(-λ)) / k!
 */
function poissonPMF(k, lambda) {
  if (!isFinite(lambda) || lambda <= 0 || k < 0) return 0;
  // Use log-space for numerical stability with large k
  const result = Math.exp(k * Math.log(lambda) - lambda - Math.log(factorial(k)));
  return isFinite(result) ? result : 0;
}

/**
 * Dixon-Coles correction factor τ (tau).
 * Adjusts the joint probability for low-scoring outcomes (0-0, 1-0, 0-1, 1-1)
 * where the independence assumption of standard bivariate Poisson breaks down.
 *
 * @param {number} h - home goals
 * @param {number} a - away goals
 * @param {number} lambdaH - home expected goals
 * @param {number} lambdaA - away expected goals
 * @param {number} rho - correlation parameter (typically -0.13 to -0.05)
 * @returns {number} correction multiplier
 */
function dixonColesTau(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1.0; // No correction for higher scores
}

/**
 * Time-decay weighting for historical data.
 * More recent matches contribute exponentially more to parameter estimation.
 *
 * w(t) = e^(-ξ * t)   where t = days since match, ξ = decay rate
 *
 * @param {number} daysSinceMatch
 * @param {number} xi - decay rate (0.005 = ~140 day half-life)
 */
export function timeDecayWeight(daysSinceMatch, xi = 0.005) {
  return Math.exp(-xi * daysSinceMatch);
}

/**
 * Compute attack/defense strength parameters using weighted historical data.
 *
 * @param {Object} teamStats - { avgGoalsFor, avgGoalsAgainst, form, played }
 * @param {number} leagueAvg - league average goals per team per match
 * @param {boolean} isHome - whether team is at home
 * @returns {{ attack: number, defense: number }}
 */
export function computeStrengthParams(teamStats, leagueAvg = 1.35, isHome = false) {
  const played = teamStats?.played || 0;
  const avgFor = teamStats?.avgGoalsFor || leagueAvg;
  const avgAgainst = teamStats?.avgGoalsAgainst || leagueAvg;

  // Attack strength = team's scoring rate / league average
  let attack = avgFor / leagueAvg;
  // Defense weakness = team's concession rate / league average
  let defense = avgAgainst / leagueAvg;

  // Bayesian shrinkage: pull toward league average when sample size is small
  // As played → ∞, shrinkage → 0 (trust the data)
  // As played → 0, shrinkage → 1 (trust the prior)
  const shrinkage = Math.exp(-0.08 * played); // Half-life ≈ 9 matches
  attack = attack * (1 - shrinkage) + 1.0 * shrinkage;
  defense = defense * (1 - shrinkage) + 1.0 * shrinkage;

  // Form adjustment: parse WDLWW into a momentum multiplier
  const formMultiplier = computeFormFactor(teamStats?.form);
  attack *= formMultiplier;

  // Home advantage (applied externally, but flagged here)
  const HOME_ADVANTAGE = isHome ? 1.10 : 1.0;
  attack *= HOME_ADVANTAGE;

  return {
    attack: clamp(attack, 0.4, 3.5),
    defense: clamp(defense, 0.4, 3.5),
  };
}

/**
 * Parse form string (e.g. "WDLWW") into a multiplier.
 * Recent results weighted more heavily via exponential decay.
 */
function computeFormFactor(form) {
  if (!form || form === 'N/A' || typeof form !== 'string') return 1.0;
  const chars = form.toUpperCase().split('').filter(c => 'WDL'.includes(c)).slice(-5);
  if (chars.length === 0) return 1.0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < chars.length; i++) {
    const recency = Math.pow(0.7, chars.length - 1 - i); // Most recent = highest weight
    const value = chars[i] === 'W' ? 1.1 : chars[i] === 'D' ? 1.0 : 0.9;
    weightedSum += value * recency;
    totalWeight += recency;
  }
  return clamp(weightedSum / totalWeight, 0.85, 1.15);
}

/**
 * Compute expected goals for a match.
 *
 * λ_home = attackHome * defenseAway * leagueAvg
 * λ_away = attackAway * defenseHome * leagueAvg
 */
export function computeExpectedGoals(homeStats, awayStats, leagueAvg = 1.35) {
  // Guard: ensure leagueAvg is valid
  if (!isFinite(leagueAvg) || leagueAvg <= 0) leagueAvg = 1.35;

  const home = computeStrengthParams(homeStats, leagueAvg, true);
  const away = computeStrengthParams(awayStats, leagueAvg, false);

  let lambdaHome = home.attack * away.defense * leagueAvg;
  let lambdaAway = away.attack * home.defense * leagueAvg;

  // NaN/Infinity guard: if computation produced garbage, fall back to averages
  if (!isFinite(lambdaHome)) {
    console.warn(`[POISSON] lambdaHome is ${lambdaHome} — falling back to ${leagueAvg}`);
    lambdaHome = leagueAvg;
  }
  if (!isFinite(lambdaAway)) {
    console.warn(`[POISSON] lambdaAway is ${lambdaAway} — falling back to ${leagueAvg}`);
    lambdaAway = leagueAvg;
  }

  return {
    lambdaHome: clamp(lambdaHome, 0.25, 4.5),
    lambdaAway: clamp(lambdaAway, 0.25, 4.5),
    params: { home, away },
  };
}

/**
 * In-play expected goals adjustment.
 * Scales pre-match λ to account for time remaining and current score.
 *
 * λ_remaining = λ_full * (timeRemaining / 90) * scorePressureMultiplier
 *
 * @param {number} lambdaFull - pre-match expected goals for full 90 mins
 * @param {number} minutesPlayed - current match minute
 * @param {number} goalDiff - from perspective of this team (positive = leading)
 * @param {number} redCardDiff - opponent red cards minus own red cards
 */
export function inPlayLambda(lambdaFull, minutesPlayed, goalDiff = 0, redCardDiff = 0) {
  const totalMinutes = 95; // Including average stoppage
  const remaining = Math.max(0, totalMinutes - minutesPlayed);
  const timeFraction = remaining / totalMinutes;

  // Base remaining lambda
  let lambda = lambdaFull * timeFraction;

  // Score pressure: trailing team attacks more aggressively
  if (goalDiff < 0) {
    // Desperation multiplier increases as time runs out while trailing
    const desperation = 1 + (Math.abs(goalDiff) * 0.12) * (1 + (minutesPlayed / totalMinutes));
    lambda *= clamp(desperation, 1.0, 1.8);
  } else if (goalDiff > 0) {
    // Leading team becomes more conservative
    const conservation = 1 - (goalDiff * 0.06) * (minutesPlayed / totalMinutes);
    lambda *= clamp(conservation, 0.5, 1.0);
  }

  // Red card impact: man advantage increases attacking potential
  if (redCardDiff > 0) {
    // Playing against 10 men
    lambda *= 1 + (redCardDiff * 0.10);
  } else if (redCardDiff < 0) {
    // Playing with 10 men (reduced output)
    lambda *= 1 - (Math.abs(redCardDiff) * 0.15);
  }

  return Math.max(0.01, lambda);
}

/**
 * Generate the full scoreline probability matrix with Dixon-Coles correction.
 *
 * @param {number} lambdaHome
 * @param {number} lambdaAway
 * @param {number} rho - Dixon-Coles correlation (-0.13 typical)
 * @returns {Object} Complete probability breakdown
 */
export function generateProbabilities(lambdaHome, lambdaAway, rho = -0.08) {
  // Guard: validate all inputs
  if (!isFinite(lambdaHome) || lambdaHome <= 0) lambdaHome = 1.35;
  if (!isFinite(lambdaAway) || lambdaAway <= 0) lambdaAway = 1.15;
  if (!isFinite(rho)) rho = -0.08;

  let homeWin = 0, draw = 0, awayWin = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0;
  let bttsYes = 0;
  const matrix = [];

  for (let h = 0; h < MAX_GOALS; h++) {
    for (let a = 0; a < MAX_GOALS; a++) {
      let prob = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
      prob *= dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
      prob = isFinite(prob) ? Math.max(0, prob) : 0; // Guard against NaN/Infinity

      matrix.push({ home: h, away: a, probability: prob });

      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;

      const total = h + a;
      if (total > 0) over05 += prob;
      if (total > 1) over15 += prob;
      if (total > 2) over25 += prob;
      if (total > 3) over35 += prob;
      if (total > 4) over45 += prob;
      if (h > 0 && a > 0) bttsYes += prob;
    }
  }

  // Normalize EVERY market by the total probability mass. The 1X2 outcomes,
  // the over/under thresholds and BTTS are all subsets of the same truncated
  // Dixon-Coles matrix (cap MAX_GOALS, plus tau drift), so they must be divided
  // by the SAME mass. Previously only 1X2 was normalized, leaving Over/Under +
  // BTTS as raw truncated sums — systematically understated on high-scoring
  // games (the dropped tail is entirely high-total outcomes; up to ~16pp on
  // lopsided λ).
  const totalMass = homeWin + draw + awayWin;
  if (totalMass > 0) {
    homeWin /= totalMass;
    draw /= totalMass;
    awayWin /= totalMass;
    over05 /= totalMass;
    over15 /= totalMass;
    over25 /= totalMass;
    over35 /= totalMass;
    over45 /= totalMass;
    bttsYes /= totalMass;
  }

  matrix.sort((a, b) => b.probability - a.probability);

  const topScorelines = matrix.slice(0, 8).map(s => ({
    score: `${s.home}-${s.away}`,
    home: s.home,
    away: s.away,
    probability: pct(s.probability),
  }));

  const probabilities = {
    home: pct(homeWin),
    draw: pct(draw),
    away: pct(awayWin),
  };

  const overUnder = {
    over05: pct(over05), over15: pct(over15), over25: pct(over25),
    over35: pct(over35), over45: pct(over45),
    under15: pct(1 - over15), under25: pct(1 - over25), under35: pct(1 - over35),
  };

  const btts = { yes: pct(bttsYes), no: pct(1 - bttsYes) };

  // Risk classification
  const maxProb = Math.max(probabilities.home, probabilities.draw, probabilities.away);
  const riskLevel = maxProb > 62 ? 'LOW' : maxProb >= 42 ? 'MEDIUM' : 'HIGH';

  // Confidence metric: how "peaked" the distribution is (entropy-based)
  const probs = [homeWin, draw, awayWin].filter(p => p > 0);
  const entropy = -probs.reduce((s, p) => s + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(3); // Maximum entropy for 3 outcomes
  const confidence = pct(1 - entropy / maxEntropy);

  return {
    probabilities,
    overUnder,
    btts,
    topScorelines,
    riskLevel,
    confidence,
    expectedGoals: {
      home: round(lambdaHome, 2),
      away: round(lambdaAway, 2),
      total: round(lambdaHome + lambdaAway, 2),
    },
    matrix: matrix.slice(0, 25).map(s => ({
      ...s,
      probability: pct(s.probability),
    })),
    model: 'dixon-coles-poisson-v2',
    rho,
  };
}

// ─── Utilities ─────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function pct(v) { return parseFloat((v * 100).toFixed(1)); }
function round(v, d) { return parseFloat(v.toFixed(d)); }

export default {
  poissonPMF,
  dixonColesTau,
  timeDecayWeight,
  computeStrengthParams,
  computeExpectedGoals,
  inPlayLambda,
  generateProbabilities,
};
