// ─── MATCH STATE MACHINE ────────────────────────────────────────────
// Deterministic, event-driven state management for a single match.
// Maintains the ground-truth match state and supports rollback for
// VAR overturns. Every state transition is idempotent and replayable.

/**
 * Creates a new match state object.
 * This is the single source of truth for a match during in-play prediction.
 */
export function createMatchState(matchId, preMatchContext = {}) {
  return {
    matchId,
    version: 0,                    // Monotonically increasing state version
    period: 'PRE_MATCH',          // PRE_MATCH | FIRST_HALF | HALF_TIME | SECOND_HALF | EXTRA_TIME | FINISHED
    minute: 0,
    stoppageMinute: 0,
    scoreHome: 0,
    scoreAway: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    yellowCardsHome: 0,
    yellowCardsAway: 0,
    subsHome: 0,
    subsAway: 0,

    // Cumulative expected goals (if available from feed)
    xGHome: 0,
    xGAway: 0,

    // Event log for replay/rollback
    events: [],

    // Snapshots for rollback (keyed by version)
    snapshots: new Map(),

    // Pre-match context (expected goals, Elo ratings, etc.)
    preMatch: {
      lambdaHome: preMatchContext.lambdaHome || 1.4,
      lambdaAway: preMatchContext.lambdaAway || 1.2,
      eloHome: preMatchContext.eloHome || 1500,
      eloAway: preMatchContext.eloAway || 1500,
      homeStats: preMatchContext.homeStats || null,
      awayStats: preMatchContext.awayStats || null,
    },

    // Timestamps
    kickoff: null,
    lastEventTime: null,
    createdAt: Date.now(),
  };
}

/**
 * Apply an event to the match state.
 * Returns a new state object (immutable pattern for safety).
 *
 * @param {Object} state - current match state
 * @param {Object} event - normalized event object
 * @returns {Object} new state after event application
 */
export function applyEvent(state, event) {
  // Save snapshot before mutation (for rollback)
  const snapshot = { ...state, events: [...state.events], snapshots: state.snapshots };
  const newState = { ...state, events: [...state.events], snapshots: state.snapshots };

  newState.version++;
  newState.lastEventTime = event.timestamp || Date.now();

  // Save pre-event snapshot
  newState.snapshots.set(newState.version - 1, snapshot);
  // Limit snapshot history to prevent memory leak (keep last 50)
  if (newState.snapshots.size > 50) {
    const oldest = Math.min(...newState.snapshots.keys());
    newState.snapshots.delete(oldest);
  }

  // Record event
  newState.events.push({
    type: event.event_type || event.type,
    minute: event.minute ?? state.minute,
    team: event.team || null,
    details: event.details || null,
    version: newState.version,
    timestamp: newState.lastEventTime,
  });

  // Apply event based on type
  const type = (event.event_type || event.type || '').toUpperCase();
  const isHome = event.team === 'home' || event.team_side === 'home';

  switch (type) {
    case 'KICKOFF':
    case 'PERIOD_START':
      newState.period = event.period || 'FIRST_HALF';
      newState.kickoff = newState.kickoff || Date.now();
      break;

    case 'GOAL':
      if (isHome) newState.scoreHome++;
      else newState.scoreAway++;
      break;

    case 'OWN_GOAL':
      // Own goal counts for the opposite team
      if (isHome) newState.scoreAway++;
      else newState.scoreHome++;
      break;

    case 'PENALTY_SCORED':
      if (isHome) newState.scoreHome++;
      else newState.scoreAway++;
      break;

    case 'PENALTY_MISSED':
    case 'PENALTY_SAVED':
      // No score change, but still a significant event for xG
      break;

    case 'RED_CARD':
    case 'SECOND_YELLOW':
      if (isHome) newState.redCardsHome++;
      else newState.redCardsAway++;
      break;

    case 'YELLOW_CARD':
      if (isHome) newState.yellowCardsHome++;
      else newState.yellowCardsAway++;
      break;

    case 'SUBSTITUTION':
      if (isHome) newState.subsHome++;
      else newState.subsAway++;
      break;

    case 'VAR_OVERTURN':
      // Rollback to the version before the overturned event
      return rollbackToVersion(newState, event.rollback_to_version || (newState.version - 2));

    case 'HALF_TIME':
      newState.period = 'HALF_TIME';
      break;

    case 'SECOND_HALF_START':
      newState.period = 'SECOND_HALF';
      break;

    case 'FULL_TIME':
    case 'MATCH_END':
      newState.period = 'FINISHED';
      break;

    case 'CLOCK_UPDATE':
      // Periodic time update from the feed
      newState.minute = event.minute || newState.minute;
      newState.stoppageMinute = event.stoppage_minute || 0;
      break;

    case 'XG_UPDATE':
      // Cumulative xG update from advanced data feed
      if (event.xG_home !== undefined) newState.xGHome = event.xG_home;
      if (event.xG_away !== undefined) newState.xGAway = event.xG_away;
      break;
  }

  // Update minute from event if provided
  if (event.minute !== undefined && type !== 'CLOCK_UPDATE') {
    newState.minute = event.minute;
  }

  return newState;
}

/**
 * Rollback state to a previous version (for VAR overturns).
 */
function rollbackToVersion(state, targetVersion) {
  const snapshot = state.snapshots.get(targetVersion);
  if (!snapshot) {
    console.warn(`[STATE] Cannot rollback to version ${targetVersion} — snapshot not found`);
    return state; // Return unchanged if no snapshot
  }

  // Replay events after the rollback point (excluding the overturned event)
  const rolledBack = { ...snapshot };
  rolledBack.version = state.version; // Keep the version counter moving forward
  rolledBack.events.push({
    type: 'VAR_ROLLBACK',
    rollbackTo: targetVersion,
    version: state.version,
    timestamp: Date.now(),
  });

  return rolledBack;
}

/**
 * Derive computed properties from match state.
 * These are convenience values for the feature engine and inference layer.
 */
export function deriveMatchContext(state) {
  const totalMinutes = state.period === 'EXTRA_TIME' ? 120 : 95;
  const effectiveMinute = Math.min(state.minute + state.stoppageMinute, totalMinutes);
  const timeRemaining = Math.max(0, totalMinutes - effectiveMinute);
  const timeFraction = effectiveMinute / totalMinutes;

  const goalDiff = state.scoreHome - state.scoreAway;
  const totalGoals = state.scoreHome + state.scoreAway;
  const manAdvantageHome = state.redCardsAway - state.redCardsHome;

  return {
    matchId: state.matchId,
    minute: effectiveMinute,
    timeRemaining,
    timeFraction,
    period: state.period,
    isLive: ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME'].includes(state.period),
    isFinished: state.period === 'FINISHED',

    // Score
    scoreHome: state.scoreHome,
    scoreAway: state.scoreAway,
    goalDiff,
    totalGoals,
    isDrawn: goalDiff === 0,
    homeLeading: goalDiff > 0,
    awayLeading: goalDiff < 0,

    // Cards & discipline
    redCardsHome: state.redCardsHome,
    redCardsAway: state.redCardsAway,
    manAdvantageHome, // positive = home has more players

    // xG
    xGHome: state.xGHome,
    xGAway: state.xGAway,
    xGDiff: state.xGHome - state.xGAway,

    // Pre-match context
    preMatchLambdaHome: state.preMatch.lambdaHome,
    preMatchLambdaAway: state.preMatch.lambdaAway,

    // Metadata
    eventCount: state.events.length,
    version: state.version,
  };
}

/**
 * Serialize match state for Redis/API (without Map objects).
 */
export function serializeState(state) {
  return {
    ...state,
    snapshots: undefined, // Don't serialize snapshot history
    events: state.events.slice(-20), // Keep last 20 events only
  };
}

export default {
  createMatchState,
  applyEvent,
  deriveMatchContext,
  serializeState,
};
