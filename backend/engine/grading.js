// ─── PREDICTION GRADING — SINGLE SOURCE OF TRUTH ─────────────────────
// A settled prediction makes TWO INDEPENDENT claims:
//   1. the probability lean   (1X2 — win / draw / loss)
//   2. the most-likely scoreline
// They are judged SEPARATELY, and the lean is judged by the probability
// the model assigned to what ACTUALLY happened — never by a binary
// "did the favourite win". A 57% lean that draws is NOT a failed forecast:
// the model priced the draw (~24%) and the draw landed, inside the range.
// Only a genuinely under-weighted result (a tail we gave little chance to)
// is a real miss — and keeping that bucket scarce is what makes it honest.
//
// This module is dependency-free and shared by the backend services AND the
// social generator (scripts/social) so "what counts as a miss" is defined
// in exactly one place. Tune the thresholds against the full ledger as n
// grows; they are deliberately surfaced as constants, not magic numbers.

// Probability the actual outcome had to clear to earn each band.
export const OUTCOME_THRESHOLDS = {
  inRange: 0.22, // actual outcome carried ≥22% — a live result we priced
  against: 0.13, // 13–22% — possible, but we under-weighted it
  //               < 13%  — a genuine miss (a tail we dismissed)
};

// The four outcome grades. `isMiss` is the ONLY thing that earns a red
// stamp — reserve red for genuine misses so red keeps meaning something.
export const OUTCOME_GRADES = {
  ON_READ: { tier: 'ON_READ', label: 'ON READ', tone: 'green', hex: '#27c06a', isMiss: false },
  IN_RANGE: { tier: 'IN_RANGE', label: 'IN RANGE', tone: 'steel', hex: '#8a94a6', isMiss: false },
  AGAINST: { tier: 'AGAINST', label: 'AGAINST READ', tone: 'amber', hex: '#d99a2b', isMiss: false },
  MISSED: { tier: 'MISSED', label: 'MISSED', tone: 'red', hex: '#A8344A', isMiss: true },
};

const TEAM = (side, names = {}) =>
  side === 'HOME' ? (names.home || 'the home side')
  : side === 'AWAY' ? (names.away || 'the away side')
  : 'a draw';

const r2 = (v) => Math.round(v * 1000) / 1000;
const norm = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n; // accept 0–100 or 0–1
};

/**
 * Grade the probability lean (1X2) by the probability assigned to the
 * outcome that actually happened.
 *
 * @returns {Object|null} { tier, label, tone, hex, isMiss, pActual, rank, topPick, actual }
 */
export function gradeOutcome({ probHome, probDraw, probAway, actualResult }) {
  const actual = String(actualResult || '').toUpperCase();
  if (!['HOME', 'DRAW', 'AWAY'].includes(actual)) return null;

  const p = { HOME: norm(probHome), DRAW: norm(probDraw), AWAY: norm(probAway) };
  const topPick = p.HOME >= p.DRAW && p.HOME >= p.AWAY ? 'HOME'
    : p.DRAW >= p.AWAY ? 'DRAW' : 'AWAY';
  const pActual = p[actual];
  const rank = 1 + Object.values(p).filter((v) => v > pActual).length; // 1 = most likely

  let g;
  if (actual === topPick) g = OUTCOME_GRADES.ON_READ;
  else if (pActual >= OUTCOME_THRESHOLDS.inRange) g = OUTCOME_GRADES.IN_RANGE;
  else if (pActual >= OUTCOME_THRESHOLDS.against) g = OUTCOME_GRADES.AGAINST;
  else g = OUTCOME_GRADES.MISSED;

  return { ...g, pActual: r2(pActual), rank, topPick, actual };
}

/**
 * Plain-words, brand-voice explanation of an outcome grade.
 */
export function outcomeBlurb(grade, names = {}) {
  if (!grade) return '';
  const pct = `${Math.round(grade.pActual * 100)}%`;
  const landed = TEAM(grade.actual, names);
  switch (grade.tier) {
    case 'ON_READ':
      return `Our top outcome landed — ${TEAM(grade.topPick, names)} at ${pct}.`;
    case 'IN_RANGE':
      return `Our lean missed, but ${landed} was inside the range — we priced it at ${pct}.`;
    case 'AGAINST':
      return `${cap(landed)} was possible at ${pct}, but we under-weighted it.`;
    case 'MISSED':
      return `A genuine miss — we gave ${landed} only ${pct}.`;
    default:
      return '';
  }
}

/**
 * Grade the scoreline call independently. An exact football scoreline is a
 * ~10–14% event even for an elite model, so a hit is a BONUS and a non-hit
 * is never, by itself, a failure.
 *
 * @param {Object} s - the verdict.scoreline shape: { exact, rankInTop, predicted, actual }
 * @returns {Object|null}
 */
export function gradeScoreline(s) {
  if (!s) return null;
  if (s.exact) return { tier: 'EXACT', label: 'EXACT', tone: 'gold', hex: '#C9A227', isHit: true };
  if (s.rankInTop && s.rankInTop <= 4)
    return { tier: 'IN_GRID', label: 'IN OUR GRID', tone: 'steel', hex: '#8a94a6', isHit: false, rankInTop: s.rankInTop };
  return { tier: 'OFF', label: 'OFF GRID', tone: 'mute', hex: '#5b626e', isHit: false };
}

/**
 * Combine the two independent calls into ONE settled-card verdict. The
 * stamp only reads "MISSED" when the OUTCOME is a genuine miss — an exact
 * scoreline on a leaned-wrong game makes it a SPLIT, never a flat red.
 *
 * @returns {Object} { stampText, stampMiss, tone, headline, exactScore }
 */
export function gradeMatch({ outcome, scoreline }) {
  const exact = scoreline?.tier === 'EXACT';
  const tier = outcome?.tier || 'IN_RANGE';
  let stampText, tone, headline;

  switch (tier) {
    case 'ON_READ':
      stampText = exact ? 'SETTLED · EXACT' : 'SETTLED · CALLED';
      tone = exact ? 'gold' : 'green';
      headline = exact ? 'Called it — exact score.' : 'Called it.';
      break;
    case 'IN_RANGE':
      stampText = exact ? 'SETTLED · IN RANGE · EXACT SCORE' : 'SETTLED · IN RANGE';
      tone = exact ? 'gold' : 'steel';
      headline = exact ? 'Lean broke, scoreline nailed.' : 'Inside our range.';
      break;
    case 'AGAINST':
      stampText = exact ? 'SETTLED · SPLIT' : 'SETTLED · AGAINST READ';
      tone = exact ? 'gold' : 'amber';
      headline = exact ? 'Wrong lean, right score.' : 'Against the read.';
      break;
    case 'MISSED':
    default:
      stampText = 'SETTLED · MISSED';
      tone = 'red';
      headline = 'A genuine miss. Printed anyway.';
      break;
  }
  return { stampText, stampMiss: tier === 'MISSED', tone, headline, exactScore: exact };
}

/**
 * Pre-match confidence band so a 57% lean never *looks* like a 78% lock.
 */
export function confidenceBand(topProb) {
  const p = norm(topProb);
  if (p < 0.45) return { tier: 'TOSS_UP', label: 'TOSS-UP', blurb: 'No clear side — the model sees this wide open.' };
  if (p < 0.58) return { tier: 'LEAN', label: 'LEAN', blurb: 'A lean, not a lock — live alternatives remain.' };
  if (p < 0.70) return { tier: 'STRONG', label: 'STRONG READ', blurb: 'A clear model preference.' };
  return { tier: 'HEAVY', label: 'HEAVY READ', blurb: 'Heavy favourite — anything else would be a real miss.' };
}

/**
 * One-call convenience over a /results/recent style row. Returns the full
 * graded verdict every surface (CEO ledger, social cards) should render.
 *
 * @param {Object} row - { prob_home, prob_draw, prob_away, actual_outcome,
 *                         predicted_outcome, home_team, away_team }
 * @param {Object} [scoreline] - optional verdict.scoreline for the bonus call
 */
export function gradeRow(row, scoreline = null) {
  const outcome = gradeOutcome({
    probHome: row.prob_home,
    probDraw: row.prob_draw,
    probAway: row.prob_away,
    actualResult: row.actual_outcome,
  });
  if (!outcome) return null;
  const names = { home: row.home_team, away: row.away_team };
  const score = gradeScoreline(scoreline);
  const match = gradeMatch({ outcome, scoreline: score });
  return {
    outcome,
    scoreline: score,
    blurb: outcomeBlurb(outcome, names),
    stampText: match.stampText,
    stampMiss: match.stampMiss,
    tone: match.tone,
    headline: match.headline,
    // 4-state tick token consumed by the social cards/captions (maps to the
    // template's ✓ / ≈ / ± / ✗ glyphs). AGAINST is its own amber state — must
    // not collapse into 'range', or the amber glyph is unreachable.
    res: outcome.tier === 'ON_READ' ? 'hit'
      : outcome.tier === 'MISSED' ? 'miss'
      : outcome.tier === 'AGAINST' ? 'amber'
      : 'range',
  };
}

export default {
  OUTCOME_THRESHOLDS,
  OUTCOME_GRADES,
  gradeOutcome,
  outcomeBlurb,
  gradeScoreline,
  gradeMatch,
  confidenceBand,
  gradeRow,
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
