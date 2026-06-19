// ─── STAKES / MOTIVATION ────────────────────────────────────────────
// "The stakes at hand." Tournament football is not played at constant
// intensity: a team that lost its opener throws everything forward on
// matchday 2-3, while a team already through its group may rotate and coast.
// The base Elo+form+market model is blind to this — it has no notion of the
// group table. This adds a SMALL, BOUNDED motivation nudge to a team's
// expected goals, driven by its real standing.
//
// This is the softest of the post-matchday signals (motivation is genuinely
// hard to model), so it is deliberately conservative: ±4% maximum, group
// stage only, and a strict no-op without real standings. Flag-gated OFF by
// default so it can be A/B'd against the live model before being trusted.
//
// Pure + dependency-free → fully unit-testable.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const GROUP_GAMES = 3;        // group stage = 3 matches
const SAFE_POINTS = 4;        // ~4 points typically secures a top-2 group place
const MAX_NUDGE = 0.04;       // ±4% on expected goals — bounded by design
const QUALIFIED_POINTS = 6;   // two wins → almost certainly through

/**
 * Motivation multiplier for a team's expected goals from its group standing.
 *
 * @param {Object} s
 * @param {boolean} s.isGroupStage - knockouts are max-stakes for everyone → no-op
 * @param {number}  s.points        - points so far in the group
 * @param {number}  s.played        - group matches already played
 * @returns {number} multiplier in [1-MAX_NUDGE, 1+MAX_NUDGE], 1.0 when no signal
 */
export function motivationFactor({ isGroupStage = true, points = null, played = null } = {}) {
  if (!isGroupStage) return 1.0;                         // knockout → no-op
  if (points == null || played == null) return 1.0;     // no standings → no-op
  if (!Number.isFinite(points) || !Number.isFinite(played)) return 1.0;
  if (played < 1) return 1.0;                            // pre-tournament → no-op

  const matchesLeft = Math.max(0, GROUP_GAMES - played);
  if (matchesLeft < 1) return 1.0;                       // group already done → no-op

  // How far below the comfort line, and how late it is to make it up.
  const urgency = clamp((SAFE_POINTS - points) / SAFE_POINTS, 0, 1);
  const lateness = clamp((GROUP_GAMES - matchesLeft - 1) / (GROUP_GAMES - 1), 0, 1); // MD2≈0, MD3≈1
  const pressure = urgency * (0.5 + 0.5 * lateness);    // chasing + running out of games

  let factor = 1 + MAX_NUDGE * pressure;

  // Already through with a game to spare → rotation / coast risk: dampen.
  if (matchesLeft <= 1 && points >= QUALIFIED_POINTS) {
    factor = Math.min(factor, 1 - MAX_NUDGE / 2);       // ≈ 0.98
  }

  return parseFloat(clamp(factor, 1 - MAX_NUDGE, 1 + MAX_NUDGE).toFixed(3));
}

/**
 * Plain-language tag for the UI ("must-win", "through", null when neutral).
 */
export function stakesTag({ isGroupStage = true, points = null, played = null } = {}) {
  if (!isGroupStage || points == null || played == null) return null;
  const matchesLeft = Math.max(0, GROUP_GAMES - played);
  if (matchesLeft < 1 || played < 1) return null;
  if (matchesLeft <= 1 && points >= QUALIFIED_POINTS) return 'likely through — may rotate';
  if (matchesLeft <= 1 && points <= 1) return 'must win to advance';
  if (points === 0) return 'lost the opener — chasing';
  return null;
}

export default { motivationFactor, stakesTag };
