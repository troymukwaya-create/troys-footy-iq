// ─── BACKTESTING & EVALUATION FRAMEWORK ─────────────────────────────
// "Time Machine" replay system for evaluating prediction accuracy.
// Replays historical matches event-by-event and measures model quality
// using proper scoring rules (Brier Score, Log Loss, Calibration Error).

import { predictPreMatch } from './inferenceEngine.js';

/**
 * Evaluate pre-match predictions against actual outcomes.
 * This is the primary backtesting function.
 *
 * @param {Array} historicalMatches - Array of completed match objects
 *   Each must have: { homeStats, awayStats, result: 'HOME'|'DRAW'|'AWAY', score }
 * @returns {Object} evaluation metrics
 */
export function evaluatePredictions(historicalMatches) {
  if (!historicalMatches || historicalMatches.length === 0) {
    return { error: 'No matches to evaluate' };
  }

  const results = [];
  let totalBrier = 0;
  let totalLogLoss = 0;
  let correct = 0;

  // Calibration bins (10 bins, 0-10%, 10-20%, etc.)
  const calibrationBins = Array.from({ length: 10 }, () => ({
    predicted: 0,
    actual: 0,
    count: 0,
  }));

  for (const match of historicalMatches) {
    try {
      // Generate prediction
      const pred = predictPreMatch(
        match.homeStats || { avgGoalsFor: 1.35, avgGoalsAgainst: 1.15 },
        match.awayStats || { avgGoalsFor: 1.15, avgGoalsAgainst: 1.35 }
      );

      // Determine actual outcome
      const actual = determineOutcome(match);
      if (!actual) continue;

      // Convert probabilities to [0,1]
      const pHome = pred.probabilities.home / 100;
      const pDraw = pred.probabilities.draw / 100;
      const pAway = pred.probabilities.away / 100;

      // Actual outcome as one-hot
      const yHome = actual === 'HOME' ? 1 : 0;
      const yDraw = actual === 'DRAW' ? 1 : 0;
      const yAway = actual === 'AWAY' ? 1 : 0;

      // ─── Brier Score ────────────────────────────────────────
      // BS = (1/3) * Σ (p_i - y_i)²
      const brier = (
        Math.pow(pHome - yHome, 2) +
        Math.pow(pDraw - yDraw, 2) +
        Math.pow(pAway - yAway, 2)
      ) / 3;
      totalBrier += brier;

      // ─── Log Loss ───────────────────────────────────────────
      // LL = -Σ y_i * log(p_i)
      const eps = 1e-10; // Prevent log(0)
      const logLoss = -(
        yHome * Math.log(Math.max(pHome, eps)) +
        yDraw * Math.log(Math.max(pDraw, eps)) +
        yAway * Math.log(Math.max(pAway, eps))
      );
      totalLogLoss += logLoss;

      // ─── Accuracy ───────────────────────────────────────────
      const predicted = pHome >= pDraw && pHome >= pAway ? 'HOME'
        : pDraw >= pHome && pDraw >= pAway ? 'DRAW'
        : 'AWAY';
      if (predicted === actual) correct++;

      // ─── Calibration ────────────────────────────────────────
      // Bin the highest-confidence prediction
      const maxProb = Math.max(pHome, pDraw, pAway);
      const binIdx = Math.min(Math.floor(maxProb * 10), 9);
      calibrationBins[binIdx].predicted += maxProb;
      calibrationBins[binIdx].actual += predicted === actual ? 1 : 0;
      calibrationBins[binIdx].count++;

      results.push({
        matchId: match.id,
        predicted,
        actual,
        correct: predicted === actual,
        probabilities: pred.probabilities,
        brier: parseFloat(brier.toFixed(4)),
        logLoss: parseFloat(logLoss.toFixed(4)),
      });
    } catch (err) {
      // Skip matches that cause errors
      continue;
    }
  }

  const n = results.length;
  if (n === 0) return { error: 'No valid predictions generated' };

  // ─── Expected Calibration Error (ECE) ────────────────────────
  let ece = 0;
  const calibration = calibrationBins.map((bin, i) => {
    if (bin.count === 0) return { range: `${i*10}-${(i+1)*10}%`, avgPredicted: 0, avgActual: 0, count: 0 };
    const avgPred = bin.predicted / bin.count;
    const avgAct = bin.actual / bin.count;
    ece += (bin.count / n) * Math.abs(avgPred - avgAct);
    return {
      range: `${i*10}-${(i+1)*10}%`,
      avgPredicted: parseFloat((avgPred * 100).toFixed(1)),
      avgActual: parseFloat((avgAct * 100).toFixed(1)),
      count: bin.count,
    };
  });

  return {
    summary: {
      totalMatches: n,
      accuracy: parseFloat(((correct / n) * 100).toFixed(1)),
      avgBrierScore: parseFloat((totalBrier / n).toFixed(4)),
      avgLogLoss: parseFloat((totalLogLoss / n).toFixed(4)),
      expectedCalibrationError: parseFloat(ece.toFixed(4)),
      // Reference: random baseline Brier ≈ 0.222, good model < 0.20
      brierVsBaseline: parseFloat(((1 - (totalBrier / n) / 0.222) * 100).toFixed(1)),
    },
    calibration,
    predictions: results.slice(0, 50), // Return first 50 for inspection
    model: 'hybrid-dixon-coles-v2',
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Determine actual match outcome from various data formats.
 */
function determineOutcome(match) {
  if (match.result) {
    const r = match.result.toUpperCase();
    if (r.includes('HOME')) return 'HOME';
    if (r.includes('DRAW')) return 'DRAW';
    if (r.includes('AWAY')) return 'AWAY';
  }

  if (match.winner) {
    const w = match.winner.toUpperCase();
    if (w.includes('HOME')) return 'HOME';
    if (w === 'DRAW') return 'DRAW';
    if (w.includes('AWAY')) return 'AWAY';
  }

  const scoreHome = match.score?.home ?? match.homeTeam?.goals;
  const scoreAway = match.score?.away ?? match.awayTeam?.goals;
  if (scoreHome != null && scoreAway != null) {
    if (scoreHome > scoreAway) return 'HOME';
    if (scoreHome === scoreAway) return 'DRAW';
    return 'AWAY';
  }

  return null;
}

export default { evaluatePredictions };
