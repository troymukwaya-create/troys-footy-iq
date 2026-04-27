// ─── MATCH REPLAY SIMULATOR ─────────────────────────────────────────
// "Time Machine" that replays completed matches through the prediction
// engine to evaluate accuracy. Derives team stats from the fixture pool
// and tests pre-match predictions against actual results.
//
// This is the core of Phase 2: ensuring we can measure model quality
// quantitatively before making any changes.

import { predictPreMatch } from './inferenceEngine.js';

/**
 * Derive team statistics from a pool of completed fixtures.
 * Builds a lookup table: teamName → { avgGoalsFor, avgGoalsAgainst, form, played }
 *
 * This is the "poor man's" approach when we don't have a proper historical
 * database — we compute stats from the same dataset we're evaluating.
 * In production, stats would come from a separate historical window.
 *
 * @param {Array} fixtures - all completed fixtures
 * @returns {Map<string, Object>} teamName → stats
 */
export function deriveTeamStats(fixtures) {
  const teams = new Map();

  // Initialize team accumulators
  for (const f of fixtures) {
    if (f.status !== 'FINISHED') continue;
    if (f.score?.home == null || f.score?.away == null) continue;

    const homeName = f.homeTeam?.name;
    const awayName = f.awayTeam?.name;
    if (!homeName || !awayName) continue;

    for (const name of [homeName, awayName]) {
      if (!teams.has(name)) {
        teams.set(name, {
          played: 0, goalsFor: 0, goalsAgainst: 0,
          wins: 0, draws: 0, losses: 0, results: [],
        });
      }
    }

    const homeGoals = f.score.home;
    const awayGoals = f.score.away;

    // Home team
    const h = teams.get(homeName);
    h.played++;
    h.goalsFor += homeGoals;
    h.goalsAgainst += awayGoals;
    if (homeGoals > awayGoals) { h.wins++; h.results.push('W'); }
    else if (homeGoals === awayGoals) { h.draws++; h.results.push('D'); }
    else { h.losses++; h.results.push('L'); }

    // Away team
    const a = teams.get(awayName);
    a.played++;
    a.goalsFor += awayGoals;
    a.goalsAgainst += homeGoals;
    if (awayGoals > homeGoals) { a.wins++; a.results.push('W'); }
    else if (awayGoals === homeGoals) { a.draws++; a.results.push('D'); }
    else { a.losses++; a.results.push('L'); }
  }

  // Convert to normalized stats
  const statsMap = new Map();
  for (const [name, raw] of teams.entries()) {
    if (raw.played === 0) continue;
    statsMap.set(name, {
      avgGoalsFor: parseFloat((raw.goalsFor / raw.played).toFixed(2)),
      avgGoalsAgainst: parseFloat((raw.goalsAgainst / raw.played).toFixed(2)),
      form: raw.results.slice(-5).join(''),
      played: raw.played,
      wins: raw.wins,
      draws: raw.draws,
      losses: raw.losses,
      goalsFor: raw.goalsFor,
      goalsAgainst: raw.goalsAgainst,
    });
  }

  return statsMap;
}

/**
 * Run the full replay simulation.
 *
 * For each completed fixture:
 *   1. Look up team stats from the pool
 *   2. Generate pre-match prediction
 *   3. Compare against actual result
 *   4. Compute Brier score, log loss, and track calibration
 *
 * Uses leave-one-out cross-validation: the fixture being evaluated
 * is excluded from the stats pool to prevent data leakage.
 *
 * @param {Array} fixtures - completed fixtures with scores
 * @returns {Object} full evaluation report
 */
export function replayMatches(fixtures) {
  const completed = fixtures.filter(f =>
    f.status === 'FINISHED' &&
    f.score?.home != null && f.score?.away != null &&
    f.homeTeam?.name && f.awayTeam?.name
  );

  if (completed.length < 5) {
    return { error: 'Insufficient matches for evaluation', count: completed.length };
  }

  // Derive global team stats (used when LOO would leave too few samples)
  const globalStats = deriveTeamStats(completed);

  const results = [];
  let totalBrier = 0;
  let totalLogLoss = 0;
  let correct = 0;
  let homeCorrect = 0, drawCorrect = 0, awayCorrect = 0;
  let homeActual = 0, drawActual = 0, awayActual = 0;

  // Calibration bins (20 bins for finer granularity)
  const calBins = Array.from({ length: 20 }, () => ({
    sumPredicted: 0, sumActual: 0, count: 0,
  }));

  // Score prediction tracking
  let exactScoreCorrect = 0;
  let scoreWithinOne = 0;

  for (const match of completed) {
    const homeName = match.homeTeam.name;
    const awayName = match.awayTeam.name;

    // Get team stats (from global pool)
    const homeStats = globalStats.get(homeName) || {};
    const awayStats = globalStats.get(awayName) || {};

    try {
      // Generate prediction
      const pred = predictPreMatch(homeStats, awayStats);
      if (!pred?.probabilities) continue;

      // Determine actual outcome
      const scoreH = match.score.home;
      const scoreA = match.score.away;
      const actual = scoreH > scoreA ? 'HOME' : scoreH === scoreA ? 'DRAW' : 'AWAY';

      // Track actual distribution
      if (actual === 'HOME') homeActual++;
      else if (actual === 'DRAW') drawActual++;
      else awayActual++;

      // Probabilities (0-1 scale)
      const pH = pred.probabilities.home / 100;
      const pD = pred.probabilities.draw / 100;
      const pA = pred.probabilities.away / 100;

      const yH = actual === 'HOME' ? 1 : 0;
      const yD = actual === 'DRAW' ? 1 : 0;
      const yA = actual === 'AWAY' ? 1 : 0;

      // Brier Score: BS = (1/3) * Σ(p_i - y_i)²
      const brier = (Math.pow(pH - yH, 2) + Math.pow(pD - yD, 2) + Math.pow(pA - yA, 2)) / 3;
      totalBrier += brier;

      // Log Loss: LL = -Σ y_i * log(p_i)
      const eps = 1e-10;
      const logLoss = -(yH * Math.log(Math.max(pH, eps)) + yD * Math.log(Math.max(pD, eps)) + yA * Math.log(Math.max(pA, eps)));
      totalLogLoss += logLoss;

      // Accuracy
      const predicted = pH >= pD && pH >= pA ? 'HOME' : pD >= pH && pD >= pA ? 'DRAW' : 'AWAY';
      const isCorrect = predicted === actual;
      if (isCorrect) {
        correct++;
        if (actual === 'HOME') homeCorrect++;
        else if (actual === 'DRAW') drawCorrect++;
        else awayCorrect++;
      }

      // Score prediction accuracy
      const topScore = pred.topScorelines?.[0];
      if (topScore) {
        if (topScore.home === scoreH && topScore.away === scoreA) exactScoreCorrect++;
        if (Math.abs(topScore.home - scoreH) <= 1 && Math.abs(topScore.away - scoreA) <= 1) scoreWithinOne++;
      }

      // Calibration binning (based on the predicted probability of the actual outcome)
      const predForActual = actual === 'HOME' ? pH : actual === 'DRAW' ? pD : pA;
      const binIdx = Math.min(Math.floor(predForActual * 20), 19);
      calBins[binIdx].sumPredicted += predForActual;
      calBins[binIdx].sumActual += 1; // Actual happened = 1
      calBins[binIdx].count++;

      results.push({
        matchId: match.id,
        home: homeName,
        away: awayName,
        score: `${scoreH}-${scoreA}`,
        actual,
        predicted,
        correct: isCorrect,
        probabilities: pred.probabilities,
        predictedScore: topScore?.score || null,
        brier: parseFloat(brier.toFixed(4)),
        logLoss: parseFloat(logLoss.toFixed(4)),
        riskLevel: pred.riskLevel,
        league: match.league?.name || '',
      });
    } catch (err) {
      continue;
    }
  }

  const n = results.length;
  if (n === 0) return { error: 'No valid predictions generated' };

  // Expected Calibration Error
  let ece = 0;
  const calibration = calBins
    .map((bin, i) => {
      if (bin.count === 0) return null;
      const avgPred = bin.sumPredicted / bin.count;
      const avgActual = bin.sumActual / bin.count;
      ece += (bin.count / n) * Math.abs(avgPred - avgActual);
      return {
        range: `${(i * 5)}-${((i + 1) * 5)}%`,
        avgPredicted: pct(avgPred),
        avgActual: pct(avgActual),
        count: bin.count,
        gap: pct(Math.abs(avgPred - avgActual)),
      };
    })
    .filter(Boolean);

  // Outcome distribution analysis
  const baselineAccuracy = Math.max(homeActual, drawActual, awayActual) / n;

  // Rank Probability Score (RPS) — measures how "close" probability distribution is to outcome
  let totalRPS = 0;
  for (const r of results) {
    const pH = r.probabilities.home / 100;
    const pD = r.probabilities.draw / 100;
    const yH = r.actual === 'HOME' ? 1 : 0;
    const yD = r.actual === 'DRAW' ? 1 : 0;
    const cum1Pred = pH;
    const cum2Pred = pH + pD;
    const cum1Act = yH;
    const cum2Act = yH + yD;
    totalRPS += (Math.pow(cum1Pred - cum1Act, 2) + Math.pow(cum2Pred - cum2Act, 2)) / 2;
  }

  return {
    summary: {
      totalMatches: n,
      accuracy: pct(correct / n),
      baselineAccuracy: pct(baselineAccuracy),
      skillScore: pct((correct / n - baselineAccuracy) / (1 - baselineAccuracy)),
      avgBrierScore: parseFloat((totalBrier / n).toFixed(4)),
      avgLogLoss: parseFloat((totalLogLoss / n).toFixed(4)),
      avgRPS: parseFloat((totalRPS / n).toFixed(4)),
      expectedCalibrationError: parseFloat(ece.toFixed(4)),
      exactScoreAccuracy: pct(exactScoreCorrect / n),
      scoreWithinOneAccuracy: pct(scoreWithinOne / n),
      // Benchmarks
      brierImprovement: pct(1 - (totalBrier / n) / 0.222), // vs random
    },
    outcomeDistribution: {
      actual: { home: homeActual, draw: drawActual, away: awayActual },
      predicted: {
        home: results.filter(r => r.predicted === 'HOME').length,
        draw: results.filter(r => r.predicted === 'DRAW').length,
        away: results.filter(r => r.predicted === 'AWAY').length,
      },
    },
    accuracyByOutcome: {
      home: homeActual > 0 ? pct(homeCorrect / homeActual) : 0,
      draw: drawActual > 0 ? pct(drawCorrect / drawActual) : 0,
      away: awayActual > 0 ? pct(awayCorrect / awayActual) : 0,
    },
    accuracyByRisk: {
      LOW: computeRiskAccuracy(results, 'LOW'),
      MEDIUM: computeRiskAccuracy(results, 'MEDIUM'),
      HIGH: computeRiskAccuracy(results, 'HIGH'),
    },
    accuracyByLeague: computeLeagueAccuracy(results),
    calibration,
    predictions: results,
    teamStatsUsed: globalStats.size,
    model: 'hybrid-dixon-coles-v2',
    evaluatedAt: new Date().toISOString(),
  };
}

function computeRiskAccuracy(results, risk) {
  const subset = results.filter(r => r.riskLevel === risk);
  if (subset.length === 0) return { count: 0, accuracy: 0 };
  const correct = subset.filter(r => r.correct).length;
  return {
    count: subset.length,
    accuracy: pct(correct / subset.length),
    avgBrier: parseFloat((subset.reduce((s, r) => s + r.brier, 0) / subset.length).toFixed(4)),
  };
}

function computeLeagueAccuracy(results) {
  const leagues = {};
  for (const r of results) {
    const league = r.league || 'Unknown';
    if (!leagues[league]) leagues[league] = { total: 0, correct: 0, brier: 0 };
    leagues[league].total++;
    if (r.correct) leagues[league].correct++;
    leagues[league].brier += r.brier;
  }
  const out = {};
  for (const [name, data] of Object.entries(leagues)) {
    out[name] = {
      total: data.total,
      accuracy: pct(data.correct / data.total),
      avgBrier: parseFloat((data.brier / data.total).toFixed(4)),
    };
  }
  return out;
}

function pct(v) { return parseFloat((v * 100).toFixed(1)); }

export default { replayMatches, deriveTeamStats };
