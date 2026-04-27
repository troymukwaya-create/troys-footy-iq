// ─── FEATURE ENGINEERING LAYER ──────────────────────────────────────
// Computes advanced in-play features from match state for model inference.
// These features capture momentum, pressure, fatigue, and tactical context
// that the raw Poisson baseline cannot model.

/**
 * Compute the full feature vector from derived match context.
 * This is the input to the ML residual correction model.
 *
 * @param {Object} ctx - output from deriveMatchContext()
 * @param {Array} recentEvents - last N events from match state
 * @returns {Object} feature vector
 */
export function computeFeatures(ctx, recentEvents = []) {
  return {
    // ─── Time Features ────────────────────────────────────────
    minute: ctx.minute,
    timeRemaining: ctx.timeRemaining,
    timeFraction: ctx.timeFraction,
    isSecondHalf: ctx.period === 'SECOND_HALF' ? 1 : 0,
    isLateGame: ctx.minute >= 75 ? 1 : 0,       // "Squeaky bum time"
    isDeathMinutes: ctx.minute >= 85 ? 1 : 0,    // Last 10 minutes

    // ─── Score State ──────────────────────────────────────────
    goalDiff: ctx.goalDiff,
    totalGoals: ctx.totalGoals,
    absGoalDiff: Math.abs(ctx.goalDiff),

    // ─── Game Pressure Index ──────────────────────────────────
    // Measures urgency: how much a trailing team needs to attack.
    // High values → the game is opening up (more goals expected)
    homePressure: computePressureIndex(ctx.goalDiff, ctx.timeRemaining, 'home'),
    awayPressure: computePressureIndex(-ctx.goalDiff, ctx.timeRemaining, 'away'),

    // ─── Numerical Advantage ──────────────────────────────────
    manAdvantageHome: ctx.manAdvantageHome,
    redCardImpact: computeRedCardImpact(ctx),

    // ─── xG Features ──────────────────────────────────────────
    xGHome: ctx.xGHome,
    xGAway: ctx.xGAway,
    xGDiff: ctx.xGDiff,
    xGOverperformanceHome: ctx.scoreHome - ctx.xGHome,  // Positive = scoring above expected
    xGOverperformanceAway: ctx.scoreAway - ctx.xGAway,

    // ─── Momentum Features (from event stream) ────────────────
    ...computeMomentumFeatures(recentEvents, ctx.minute),

    // ─── Fatigue Index ────────────────────────────────────────
    fatigueIndex: computeFatigueIndex(ctx),

    // ─── Pre-match Strength Differential ──────────────────────
    preMatchLambdaDiff: ctx.preMatchLambdaHome - ctx.preMatchLambdaAway,
    preMatchLambdaTotal: ctx.preMatchLambdaHome + ctx.preMatchLambdaAway,
  };
}

/**
 * Game Pressure Index.
 * Models the desperation of a trailing team and the conservatism of a leading team.
 *
 * Formula:
 *   If trailing: pressure = |goalDiff| * (1 + minuteFraction^2) * timeDecay
 *   If leading:  pressure = -goalDiff * 0.3 * (1 - minuteFraction)
 *   If level:    pressure = 0.5 * minuteFraction  (slight increase as game progresses)
 *
 * @param {number} goalDiff - from this team's perspective (negative = trailing)
 * @param {number} timeRemaining - minutes remaining
 * @param {string} side - 'home' or 'away'
 * @returns {number} pressure index [0, 5+]
 */
function computePressureIndex(goalDiff, timeRemaining, side) {
  const totalMinutes = 95;
  const minuteFraction = 1 - (timeRemaining / totalMinutes);

  if (goalDiff < 0) {
    // Trailing: exponential urgency as time runs out
    const deficit = Math.abs(goalDiff);
    const urgency = deficit * (1 + Math.pow(minuteFraction, 2));
    const timeDecay = 1 / Math.max(timeRemaining / 30, 0.1); // Spikes as time → 0
    return Math.min(urgency * Math.min(timeDecay, 5), 10);
  }

  if (goalDiff > 0) {
    // Leading: conservation pressure (inverse)
    return -goalDiff * 0.3 * (1 - minuteFraction) * -1;
  }

  // Level: mild pressure building
  return 0.5 * minuteFraction;
}

/**
 * Red Card Impact.
 * Models the dynamic effect of red cards over time.
 * Impact is not constant — teams adapt but then tire.
 *
 * Impact curve: low immediately (tactical reorganization),
 * then builds over 15-20 minutes (fatigue kicks in).
 */
function computeRedCardImpact(ctx) {
  const totalReds = ctx.redCardsHome + ctx.redCardsAway;
  if (totalReds === 0) return 0;

  // Simplified: man advantage * time-in-match factor
  // In reality, you'd track minutes_since_each_red_card
  const timeFactor = Math.min(ctx.timeFraction * 1.5, 1.0); // Builds over the match
  return ctx.manAdvantageHome * (0.8 + 0.4 * timeFactor);
}

/**
 * Momentum Features from recent event stream.
 * Analyzes the last 10-15 minutes of events to detect
 * shifts in attacking pressure, shot frequency, etc.
 */
function computeMomentumFeatures(events, currentMinute) {
  const defaults = {
    homeEventRate5m: 0,
    awayEventRate5m: 0,
    homeEventRate10m: 0,
    awayEventRate10m: 0,
    momentumSwing: 0,        // Positive = home dominating recent play
    recentGoalMinute: -1,    // Minutes since last goal (-1 = no recent goal)
    isGoalFlurry: 0,         // 1 if 2+ goals in last 10 minutes
  };

  if (!events || events.length === 0) return defaults;

  const significantTypes = ['GOAL', 'SHOT', 'CORNER', 'FREE_KICK', 'PENALTY_SCORED', 'PENALTY_MISSED'];

  // Filter to significant attacking events
  const attacking = events.filter(e =>
    significantTypes.includes((e.type || '').toUpperCase())
  );

  const last5m = attacking.filter(e => e.minute >= currentMinute - 5);
  const last10m = attacking.filter(e => e.minute >= currentMinute - 10);

  const homeEvents5m = last5m.filter(e => e.team === 'home').length;
  const awayEvents5m = last5m.filter(e => e.team === 'away').length;
  const homeEvents10m = last10m.filter(e => e.team === 'home').length;
  const awayEvents10m = last10m.filter(e => e.team === 'away').length;

  // Goal recency
  const goals = events.filter(e => (e.type || '').toUpperCase() === 'GOAL');
  const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
  const recentGoalMinute = lastGoal ? currentMinute - (lastGoal.minute || 0) : -1;

  // Goal flurry detection
  const goalsLast10m = goals.filter(e => e.minute >= currentMinute - 10).length;

  return {
    homeEventRate5m: homeEvents5m,
    awayEventRate5m: awayEvents5m,
    homeEventRate10m: homeEvents10m,
    awayEventRate10m: awayEvents10m,
    momentumSwing: (homeEvents10m - awayEvents10m) / Math.max(homeEvents10m + awayEvents10m, 1),
    recentGoalMinute,
    isGoalFlurry: goalsLast10m >= 2 ? 1 : 0,
  };
}

/**
 * Fatigue Index.
 * Models physical deterioration throughout the match.
 * Accelerated by:
 *   - Playing with 10 men
 *   - High-tempo matches (many events)
 *   - Extra time
 *
 * Scale: 0.0 (fresh) → 1.0 (exhausted)
 */
function computeFatigueIndex(ctx) {
  let fatigue = ctx.timeFraction * 0.7; // Base: linear ramp to 0.7 at FT

  // 10 men accelerates fatigue
  if (ctx.redCardsHome > 0 || ctx.redCardsAway > 0) {
    fatigue += 0.1 * (ctx.redCardsHome + ctx.redCardsAway);
  }

  // High event count suggests high-tempo match
  if (ctx.eventCount > 30) {
    fatigue += 0.05;
  }

  // Extra time
  if (ctx.period === 'EXTRA_TIME') {
    fatigue = Math.max(fatigue, 0.85);
  }

  return Math.min(fatigue, 1.0);
}

/**
 * Compute the ML residual correction (Layer 2 of hybrid model).
 *
 * This is a rule-based approximation of what a trained LightGBM model would learn.
 * In production, this would be replaced by actual model inference.
 *
 * Returns delta modifiers for [home, draw, away] probabilities.
 *
 * @param {Object} features - output of computeFeatures()
 * @returns {{ homeDelta: number, drawDelta: number, awayDelta: number }}
 */
export function computeResidualCorrection(features) {
  let homeDelta = 0;
  let drawDelta = 0;
  let awayDelta = 0;

  // 1. Momentum correction
  if (features.momentumSwing > 0.3) {
    // Home dominating recent play
    homeDelta += features.momentumSwing * 0.08;
    awayDelta -= features.momentumSwing * 0.05;
    drawDelta -= features.momentumSwing * 0.03;
  } else if (features.momentumSwing < -0.3) {
    awayDelta += Math.abs(features.momentumSwing) * 0.08;
    homeDelta -= Math.abs(features.momentumSwing) * 0.05;
    drawDelta -= Math.abs(features.momentumSwing) * 0.03;
  }

  // 2. Red card impact
  if (features.manAdvantageHome > 0) {
    homeDelta += features.redCardImpact * 0.06;
    awayDelta -= features.redCardImpact * 0.08;
    drawDelta += features.redCardImpact * 0.02;
  } else if (features.manAdvantageHome < 0) {
    awayDelta += Math.abs(features.redCardImpact) * 0.06;
    homeDelta -= Math.abs(features.redCardImpact) * 0.08;
    drawDelta += Math.abs(features.redCardImpact) * 0.02;
  }

  // 3. xG overperformance correction (regression to mean)
  // If a team is scoring above xG, they're "lucky" — slight downward adjustment
  if (features.xGOverperformanceHome > 0.8) {
    homeDelta -= 0.03; // Slight regression
  }
  if (features.xGOverperformanceAway > 0.8) {
    awayDelta -= 0.03;
  }

  // 4. Late-game draw stickiness
  // Draws become increasingly "sticky" — harder to break in final minutes
  if (features.goalDiff === 0 && features.isLateGame) {
    drawDelta += 0.06 * features.timeFraction;
    homeDelta -= 0.03 * features.timeFraction;
    awayDelta -= 0.03 * features.timeFraction;
  }

  // 5. Goal flurry effect — if lots of goals recently, more likely to see more
  if (features.isGoalFlurry) {
    // Open game: reduce draw, boost both win probabilities slightly
    drawDelta -= 0.04;
    homeDelta += 0.02;
    awayDelta += 0.02;
  }

  // 6. Fatigue asymmetry (team with fewer players tires faster)
  if (features.fatigueIndex > 0.7 && features.manAdvantageHome !== 0) {
    const fatigueBoost = (features.fatigueIndex - 0.7) * 0.15;
    if (features.manAdvantageHome > 0) {
      homeDelta += fatigueBoost;
      awayDelta -= fatigueBoost;
    } else {
      awayDelta += fatigueBoost;
      homeDelta -= fatigueBoost;
    }
  }

  // Clamp deltas to prevent extreme corrections
  const clamp = (v) => Math.max(-0.15, Math.min(0.15, v));

  return {
    homeDelta: clamp(homeDelta),
    drawDelta: clamp(drawDelta),
    awayDelta: clamp(awayDelta),
  };
}

export default {
  computeFeatures,
  computeResidualCorrection,
};
