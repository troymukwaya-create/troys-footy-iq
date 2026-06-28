// ─── PERCEPTION (shadow) ────────────────────────────────────────────────────
// Read the film, not the scoreboard. Pure, dependency-free helpers that turn a
// box-score into texture: a "deserved result" from xG (or a shots proxy when xG
// is missing), and a 5-axis style fingerprint. OBSERVABILITY ONLY — these never
// touch the live lambda. The deserved result feeds the perfElo ladder (REMEMBER);
// the fingerprints are surfaced in the explainer/UI behind STYLE_FINGERPRINTS.
//
// International fixtures are sparse and providers return strings ("55%"), so
// every reader degrades gracefully: missing/garbage ⇒ null, never a crash.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Parse a number from a number or a string like "55%" / "12"; null otherwise. */
export function numOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

// ── Deserved result from xG ──────────────────────────────────────────────────
// Logistic on the xG margin (scale 1.0 goal), clamped [0.15, 0.85] so one freak
// xG night can't claim a team is 99% better — it teaches a soft lesson, not a
// hard one. Returns 0..1 (P(home "deserved" the win)).
export function xgResult(xgFor, xgAgainst) {
  const f = numOrNull(xgFor), a = numOrNull(xgAgainst);
  if (f == null || a == null) return null;
  return clamp(1 / (1 + Math.pow(10, -(f - a) / 1.0)), 0.15, 0.85);
}

// ── Shots proxy when xG is absent ────────────────────────────────────────────
// Convert shots into a proxy-xG using rough conversion priors: a shot on target
// is worth far more than an off-target attempt. Then run it through xgResult, so
// the perfElo ladder still gets a soft "deserved" signal for sparse fixtures.
export function proxyXg(shotsOnTarget, shotsTotal) {
  const sot = numOrNull(shotsOnTarget), tot = numOrNull(shotsTotal);
  if (sot == null && tot == null) return null;
  const onTarget = sot ?? 0;
  const offTarget = Math.max(0, (tot ?? onTarget) - onTarget);
  return onTarget * 0.30 + offTarget * 0.04; // ~big-chance-weighted
}

/** Deserved result from box score: xG if present, else the shots proxy. Null if neither. */
export function deservedResult(home, away) {
  const xr = xgResult(home?.xg, away?.xg);
  if (xr != null) return { value: xr, source: 'xg' };
  const ph = proxyXg(home?.shotsOnTarget, home?.shotsTotal);
  const pa = proxyXg(away?.shotsOnTarget, away?.shotsTotal);
  const pr = xgResult(ph, pa);
  if (pr != null) return { value: pr, source: 'shots-proxy' };
  return null; // sparse fixture ⇒ teach nothing (the caller falls back to plain Elo)
}

// ── EWMA — smooth a style axis across recent matches (latest weighted most) ───
export function ewma(prev, next, alpha = 0.4) {
  const n = numOrNull(next);
  if (n == null) return numOrNull(prev);
  const p = numOrNull(prev);
  return p == null ? n : alpha * n + (1 - alpha) * p;
}

// ── 5-axis style fingerprint (per match, normalised ~0..1) ───────────────────
// Proxies, not truth — but stable and comparable. Every axis is null-safe.
export function styleVector(stats = {}) {
  const sot = numOrNull(stats.shotsOnTarget);
  const shots = numOrNull(stats.shotsTotal);
  const corners = numOrNull(stats.corners);
  const fouls = numOrNull(stats.fouls);
  const xg = numOrNull(stats.xg);
  const v = {};
  // tempo — volume of attacking events, normalised to a busy-match ceiling (~25)
  if (shots != null || corners != null) v.tempo = clamp(((shots ?? 0) + (corners ?? 0)) / 25, 0, 1);
  // chanceQuality — xG per shot if we have it, else share of shots on target
  if (xg != null && shots) v.chanceQuality = clamp(xg / shots / 0.18, 0, 1); // ~0.18 xG/shot = elite
  else if (sot != null && shots) v.chanceQuality = clamp(sot / shots, 0, 1);
  // setPieceReliance — corners relative to open-play shot volume
  if (corners != null && shots) v.setPieceReliance = clamp(corners / (shots + corners), 0, 1);
  // pressIntensity — fouls as a disruption proxy (high press concedes more fouls)
  if (fouls != null) v.pressIntensity = clamp(fouls / 18, 0, 1);
  return Object.keys(v).length ? v : null;
}

/** EWMA-merge a new match's style vector into a stored fingerprint. */
export function mergeStyle(prev = {}, next, alpha = 0.4) {
  if (!next) return prev || null;
  const out = { ...(prev || {}) };
  for (const k of Object.keys(next)) out[k] = ewma(prev?.[k], next[k], alpha);
  return out;
}

// ── gameStateResilience — does a team fight back? ────────────────────────────
// Split a match at the FIRST goal (from events) and compare attacking rate while
// trailing vs leading vs level. >1 ⇒ raises its game when behind. Null-safe.
export function gameStateResilience(events = [], teamId, opts = {}) {
  const { window = 90 } = opts;
  if (!Array.isArray(events) || !events.length || teamId == null) return null;
  const goals = events
    .filter(e => /goal/i.test(e?.type || '') && numOrNull(e?.minute) != null)
    .map(e => ({ minute: numOrNull(e.minute), team: String(e.teamId ?? e.team ?? '') }))
    .sort((a, b) => a.minute - b.minute);
  if (!goals.length) return null;
  const first = goals[0];
  const leadingFromFirst = String(first.team) === String(teamId);
  // Rate proxy = team's attacking events (shots/goals) per minute, before vs after.
  const teamEvents = events.filter(e => String(e?.teamId ?? e?.team ?? '') === String(teamId) && /shot|goal/i.test(e?.type || ''));
  const before = teamEvents.filter(e => numOrNull(e.minute) != null && numOrNull(e.minute) <= first.minute).length;
  const after = teamEvents.filter(e => numOrNull(e.minute) != null && numOrNull(e.minute) > first.minute).length;
  const minsBefore = Math.max(1, first.minute);
  const minsAfter = Math.max(1, window - first.minute);
  const rateBefore = before / minsBefore;
  const rateAfter = after / minsAfter;
  if (rateBefore === 0 && rateAfter === 0) return null;
  const ratio = rateBefore > 0 ? rateAfter / rateBefore : (rateAfter > 0 ? 2 : 1);
  // When the team went BEHIND at the first goal, a high after-rate = resilience.
  return { trailing: !leadingFromFirst, responseRatio: clamp(ratio, 0, 3) };
}

// ── Steam / drift reader ─────────────────────────────────────────────────────
// Movement of the consensus implied prob from the first lock cycle to close —
// the market's late information. Pure: pass the ordered odds_history snapshots.
// Logged only; never reads into the scored path.
export function steamDrift(snapshots = []) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return null;
  const first = snapshots[0]?.implied || snapshots[0];
  const last = snapshots[snapshots.length - 1]?.implied || snapshots[snapshots.length - 1];
  const d = (k) => {
    const a = numOrNull(first?.[k]), b = numOrNull(last?.[k]);
    return a == null || b == null ? null : parseFloat((b - a).toFixed(2));
  };
  return { home: d('home'), draw: d('draw'), away: d('away') };
}

export default {
  numOrNull, xgResult, proxyXg, deservedResult, ewma,
  styleVector, mergeStyle, gameStateResilience, steamDrift,
};
