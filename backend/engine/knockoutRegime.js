// ─── KNOCKOUT REGIME MODEL (shadow) ─────────────────────────────────────────
// A knockout is a different game from a group match: 90 minutes is cagier (more
// draws), and a level 90 goes to extra time then penalties — where the rating
// edge still counts but is shrunk hard toward a coin flip. The live model
// (nationalTeams.predictWorldCupMatch) already splits the 90-min draw with a
// penalty-shrunk lean; this module generalises that into three TUNABLE levers —
//   • kappa        — draw-inflation on the 90-min 1X2 (knockouts draw more)
//   • ET 2nd-Poisson — model extra time as a short second Poisson pass
//   • penShrink    — how hard the rating edge is shrunk toward 0.5 in a shootout
// — with DEFAULTS that reproduce today's behaviour byte-for-byte, so swapping it
// into the live path with default opts is a provable no-op. Pure + dependency-
// free: the caller injects the Poisson function (so we never import poissonCore).
//
// Shadow-only: scored under model_version `wc-knockout-shadow`. KNOCKOUT_REGIME_SHADOW.

// Defaults == the live model's exact knockout behaviour (nationalTeams.js).
export const KNOCKOUT_DEFAULTS = Object.freeze({
  kappa: 1.0,          // 1.0 = no draw inflation (live behaviour)
  penShrink: 0.5,      // live: pHomeInExtra = 0.5 + (exp-0.5)*0.5
  penLo: 0.35,         // live clamp
  penHi: 0.65,
  useEtPoisson: false, // live: simple penalty-shrunk split, no ET Poisson
  etLambdaScale: 1 / 3, // extra time ≈ 30 of 90 minutes (only used if useEtPoisson)
});

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function r1(v) { return parseFloat(Number(v).toFixed(1)); }

/**
 * Inflate the draw probability of a 90-minute 1X2 by `kappa`, renormalising
 * home/away to keep the sum constant. kappa === 1 ⇒ returned unchanged (no-op).
 */
export function inflateDraw({ home, draw, away }, kappa = 1.0) {
  if (!(kappa > 0) || kappa === 1) return { home, draw, away };
  const total = home + draw + away;
  const d = Math.min(draw * kappa, total); // never exceed the whole mass
  const ha = home + away;
  const scale = ha > 0 ? (total - d) / ha : 0;
  return { home: home * scale, draw: d, away: away * scale };
}

/**
 * P(home advances | 90 was drawn). Live default = the penalty-shrunk lean.
 * With useEtPoisson, extra time is a second short Poisson pass and only a level
 * ET goes to the (shrunk) shootout. `poissonFn(lh, la)` must return percentages
 * { home, draw, away } (e.g. poissonCore.generateProbabilities(...).probabilities).
 */
export function pHomeAdvances({ exp, lambdaHome, lambdaAway }, opts = {}) {
  const o = { ...KNOCKOUT_DEFAULTS, ...opts };
  const shootout = clamp(0.5 + (exp - 0.5) * o.penShrink, o.penLo, o.penHi);
  if (o.useEtPoisson && typeof o.poissonFn === 'function'
      && Number.isFinite(lambdaHome) && Number.isFinite(lambdaAway)) {
    const et = o.poissonFn(lambdaHome * o.etLambdaScale, lambdaAway * o.etLambdaScale) || {};
    const etH = (et.home ?? 0) / 100, etD = (et.draw ?? 100) / 100;
    return clamp(etH + etD * shootout, 0, 1); // win in ET, or level ET → shootout
  }
  return shootout;
}

/**
 * Apply the knockout regime to a 90-minute prediction.
 * Returns { probabilities, advance } where probabilities is the (optionally
 * draw-inflated) 1X2 and advance is { home, away } = P(reach next round).
 * Default opts ⇒ identical to the live model's knockout output.
 */
export function applyKnockoutRegime({ home, draw, away, exp, lambdaHome, lambdaAway }, opts = {}) {
  const o = { ...KNOCKOUT_DEFAULTS, ...opts };
  const prob = inflateDraw({ home, draw, away }, o.kappa);
  const ph = pHomeAdvances({ exp, lambdaHome, lambdaAway }, o);
  return {
    probabilities: { home: r1(prob.home), draw: r1(prob.draw), away: r1(prob.away) },
    advance: { home: r1(prob.home + prob.draw * ph), away: r1(prob.away + prob.draw * (1 - ph)) },
  };
}

export default { KNOCKOUT_DEFAULTS, inflateDraw, pHomeAdvances, applyKnockoutRegime };
