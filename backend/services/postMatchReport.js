// ─── POST-MATCH REPORT — THE RECEIPT ─────────────────────────────────
// Once a match finishes, the analysis page stops being a prediction and
// becomes a verdict: what we said before kickoff (the LOCKED row — the
// exact numbers the public Brier scores), what actually happened, and
// which calls landed. Honesty rule: misses render exactly as loudly as
// hits — the verdict object reports both and the UI must show both.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getLockedWcPredictionsMap } from './wcDisplayPrediction.js';
import api from './apisports.js';
import { buildStory, polishStory } from './matchNarrative.js';
import { gradeOutcome, gradeScoreline, gradeMatch, outcomeBlurb } from '../engine/grading.js';
import { deciderOf } from './resultService.js';

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
  // Knockout decider — 'FT' | 'AET' | 'PEN' + advancing side + pens score.
  // DISPLAY-ONLY: grading below stays on the 90' ft score; this exists so
  // the verdict/receipt can say "2–2 · Belgium win 4–2 on pens" instead of
  // looking blind to what every fan just watched.
  const dec = deciderOf(match);
  const advancedName = dec.winner === 'HOME' ? (match.homeTeam?.name || 'Home')
    : dec.winner === 'AWAY' ? (match.awayTeam?.name || 'Away') : null;
  const decided = dec.decidedBy === 'FT' ? null : {
    by: dec.decidedBy,                             // 'AET' | 'PEN'
    winner: dec.winner,                            // 'HOME' | 'AWAY' | null
    advanced: advancedName,                        // team name
    penalty: dec.decidedBy === 'PEN' ? { home: dec.penH, away: dec.penA } : null,
    finalScore: result,                            // includes extra time
  };

  const [lockedMap, matchStats, events] = await Promise.all([
    getLockedWcPredictionsMap([matchId]).catch(() => new Map()),
    api.getFixtureStats(matchId).catch(() => null),
    api.getFixtureEvents(matchId).catch(() => []),
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

  // ── The match story: how the game met or broke our forecast ──────────
  // Deterministic facts from the goal/red-card timeline, polished into
  // brand voice (Claude, cached per finished score). Never blocks: any
  // failure falls back to the deterministic line, and a story is always
  // present so the receipt can explain the result on every platform.
  const homeName = match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.name || 'Away';
  const outcomeCorrect = predictedOutcome === actualOutcome;

  // Graded verdict — the lean judged by the probability we gave the actual
  // result, the scoreline judged on its own. A leaned-wrong game with an
  // exact scoreline is a SPLIT, not a flat red. (outcomeCorrect kept above
  // for back-compat / aggregate accuracy.)
  const outcomeGrade = gradeOutcome({
    probHome: p.home, probDraw: p.draw, probAway: p.away, actualResult: actualOutcome,
  });
  const scorelineGrade = gradeScoreline(scoreline);
  const assessment = gradeMatch({ outcome: outcomeGrade, scoreline: scorelineGrade });
  const gradeBlurb = outcomeBlurb(outcomeGrade, { home: homeName, away: awayName });
  let story = null;
  try {
    const built = buildStory({
      homeName, awayName, ft,
      predictedOutcome, predictedProb, outcomeCorrect, scoreline, events,
    });
    const pickName = predictedOutcome === 'HOME' ? homeName : predictedOutcome === 'AWAY' ? awayName : 'a draw';
    let text = await polishStory(
      built,
      { homeName, awayName, ft, pickName, pct: `${Math.round(predictedProb)}%`, outcomeCorrect },
      `${matchId}:${ft.home}-${ft.away}`,
    );
    // Decider sentence appended AFTER polish — deterministic, so the pens/ET
    // fact can never be dropped or reworded into something wrong.
    if (decided?.advanced) {
      const deciderLine = decided.by === 'PEN'
        ? `${decided.advanced} advanced ${decided.penalty?.home ?? '?'}–${decided.penalty?.away ?? '?'} on penalties.`
        : `${decided.advanced} won it ${decided.finalScore.home}–${decided.finalScore.away} in extra time.`;
      if (!text.includes('penalt') && !text.includes('extra time')) text = `${text.trim()} ${deciderLine}`;
    }
    story = { kind: built.kind, tag: built.tag, minute: built.minute, text };
  } catch (err) {
    console.error('[postMatchReport] story build failed:', err.message);
  }

  return {
    status: 'FINISHED',
    result,
    ftResult: ft,
    // 'AET'/'PEN' context (null for a normal 90' finish) — advancing side,
    // shootout score, final-after-ET score. Display-only; never graded.
    decided,
    // The exact pre-match display object — probabilities, topScorelines,
    // overUnder, btts, expectedGoals, model/market split, lockedAt.
    probability: locked,
    verdict: {
      predictedOutcome,
      predictedProb,
      actualOutcome,
      outcomeCorrect,
      // Graded verdict (the honest replacement for the binary outcomeCorrect).
      outcomeGrade,
      scorelineGrade,
      assessment,
      gradeBlurb,
      scoreline,
      marketCalls,
      story,
      decided,
      brier: scoredRow?.brier_score != null ? Number(scoredRow.brier_score) : brierFor(p, actualOutcome),
      inLedger: !!scoredRow,
      lockedAt: locked.lockedAt || null,
      model: locked.model || null,
    },
    matchStats,
  };
}

export default { buildPostMatchReport };
