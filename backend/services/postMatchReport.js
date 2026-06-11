// ─── POST-MATCH REPORT — THE RECEIPT ─────────────────────────────────
// Once a match finishes, the analysis page stops being a prediction and
// becomes a verdict: what we said before kickoff (the LOCKED row — the
// exact numbers the public Brier scores), what actually happened, and
// which calls landed. Honesty rule: misses render exactly as loudly as
// hits — the verdict object reports both and the UI must show both.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getLockedWcPredictionsMap } from './wcDisplayPrediction.js';
import api from './apisports.js';

// Outcome from a final score, in the same vocabulary the ledger uses.
function outcomeOf(home, away) {
  if (home > away) return 'HOME';
  if (home < away) return 'AWAY';
  return 'DRAW';
}

// Same math as resultService.computeMatchMetrics — one definition of
// "our Brier for this match" everywhere it is shown.
function brierFor(probabilities, actual) {
  const pH = (probabilities.home || 0) / 100;
  const pD = (probabilities.draw || 0) / 100;
  const pA = (probabilities.away || 0) / 100;
  const yH = actual === 'HOME' ? 1 : 0;
  const yD = actual === 'DRAW' ? 1 : 0;
  const yA = actual === 'AWAY' ? 1 : 0;
  return parseFloat((((pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2) / 3).toFixed(4));
}

/**
 * Build the full post-match analysis payload for a finished apf_ fixture.
 * Always returns at least { status, result }; when a locked prediction
 * exists it adds the pre-match probability object (the same shape the
 * pre-match page rendered), a verdict, and the actual match statistics.
 */
export async function buildPostMatchReport(match, matchId) {
  const result = { home: match.score?.home ?? null, away: match.score?.away ?? null };
  // Markets and the public Brier settle on the 90-minute score.
  const ft = {
    home: match.fullTime?.home ?? result.home,
    away: match.fullTime?.away ?? result.away,
  };

  const [lockedMap, matchStats] = await Promise.all([
    getLockedWcPredictionsMap([matchId]).catch(() => new Map()),
    api.getFixtureStats(matchId).catch(() => null),
  ]);
  const locked = lockedMap.get(String(matchId)) || null;

  if (!locked || ft.home == null || ft.away == null) {
    // No locked call for this match (finished friendly pre-lock-job,
    // historical fixture…) — final score + real stats, no fake verdict.
    return { status: 'FINISHED', result, matchStats };
  }

  const p = locked.probabilities;
  const actualOutcome = outcomeOf(ft.home, ft.away);
  const predictedOutcome =
    p.home >= p.draw && p.home >= p.away ? 'HOME'
    : p.draw >= p.home && p.draw >= p.away ? 'DRAW'
    : 'AWAY';
  const predictedProb = predictedOutcome === 'HOME' ? p.home : predictedOutcome === 'DRAW' ? p.draw : p.away;

  // Scoreline call — judged against the published top-scorelines list.
  const actualScore = `${ft.home}-${ft.away}`;
  const tops = locked.topScorelines || [];
  const rank = tops.findIndex(s => s.score === actualScore);
  const scoreline = tops.length
    ? {
        predicted: tops[0].score,
        predictedProb: tops[0].probability,
        actual: actualScore,
        exact: tops[0].score === actualScore,
        rankInTop: rank >= 0 ? rank + 1 : null,
      }
    : null;

  // Goal-market calls: the side we leaned to (≥50%) vs what happened.
  const totalGoals = ft.home + ft.away;
  const btts = ft.home > 0 && ft.away > 0;
  const marketCalls = [];
  const ou = locked.overUnder;
  if (ou?.over25 != null) {
    const leanOver = ou.over25 >= 50;
    marketCalls.push({
      label: leanOver ? 'Over 2.5 goals' : 'Under 2.5 goals',
      prob: leanOver ? ou.over25 : ou.under25,
      hit: leanOver ? totalGoals > 2.5 : totalGoals < 2.5,
    });
  }
  if (locked.btts?.yes != null) {
    const leanYes = locked.btts.yes >= 50;
    marketCalls.push({
      label: leanYes ? 'Both teams to score' : 'BTTS — No',
      prob: leanYes ? locked.btts.yes : locked.btts.no,
      hit: leanYes ? btts : !btts,
    });
  }

  // Is this match in the public ledger yet? (result ingest runs every 2h)
  let scoredRow = null;
  if (isDbAvailable()) {
    const r = await safeQuery(
      `SELECT brier_score, prediction_correct FROM model_performance
        WHERE match_external_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [String(matchId)]
    );
    scoredRow = r?.rows?.[0] || null;
  }

  return {
    status: 'FINISHED',
    result,
    ftResult: ft,
    // The exact pre-match display object — probabilities, topScorelines,
    // overUnder, btts, expectedGoals, model/market split, lockedAt.
    probability: locked,
    verdict: {
      predictedOutcome,
      predictedProb,
      actualOutcome,
      outcomeCorrect: predictedOutcome === actualOutcome,
      scoreline,
      marketCalls,
      brier: scoredRow?.brier_score != null ? Number(scoredRow.brier_score) : brierFor(p, actualOutcome),
      inLedger: !!scoredRow,
      lockedAt: locked.lockedAt || null,
      model: locked.model || null,
    },
    matchStats,
  };
}

export default { buildPostMatchReport };
