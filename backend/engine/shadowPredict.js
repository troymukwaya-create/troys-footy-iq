// ─── SHADOW PREDICTION ASSEMBLER (PREDICT) ──────────────────────────────────
// Produces the parallel shadow predictions that run ALONGSIDE the scored model
// without ever touching it. Each track calls predictWorldCupMatch with a shadow
// `opts` bundle (proven no-op when empty), and — critically — with marketProbs
// = null, so every shadow signal is scored on the PURE model only. That is the
// market-echo guard: a new signal must prove itself unblended, or the 60% market
// weight would mask whether it actually adds anything.
//
// Tracks (only the flag-enabled ones are emitted; all flags default OFF):
//   wc-perf-elo-shadow     — ratings from the deserved-result ladder (perfElo)
//   wc-knockout-shadow     — draw-inflation + penalty-shrink advance regime
//   wc-scout-shadow        — market-blind Claude λ nudge
//   wc-calibration-shadow  — confidence remap from the learned calibration map
//   wc-fanbrain-shadow     — all enabled signals combined (the headline track)

import { predictWorldCupMatch, getElo } from './nationalTeams.js';
import { getPerfElo } from './perfElo.js';
import { KNOCKOUT_DEFAULTS } from './knockoutRegime.js';
import { fanbrainFlags } from '../config/fanbrainFlags.js';

/** Reduce a full prediction to the shadow row payload (pure, market-blind). */
function track(version, pred) {
  return {
    version,
    probabilities: pred.probabilities, // === pure modelProbs, after any shadow transform
    advance: pred.advance || null,
    lambda: { home: pred.nationalStrength?.lambdaHome, away: pred.nationalStrength?.lambdaAway },
    elo: { home: pred.nationalStrength?.homeElo, away: pred.nationalStrength?.awayElo },
  };
}

/**
 * Build every enabled shadow prediction for one match. `scoutMul` and `calMap`
 * are supplied by their services (null ⇒ that track is skipped). Returns [] when
 * no shadow flag is on, so the caller's loop is a clean no-op by default.
 * marketProbs is intentionally NOT a parameter — shadow is always market-blind.
 */
export function buildShadowPredictions({ homeName, awayName, ctx = {}, scoutMul = null, calMap = null } = {}) {
  if (!fanbrainFlags.anyShadowOn()) return [];
  const pure = (opts) => predictWorldCupMatch(homeName, awayName, null, ctx, opts); // null market = pure
  const out = [];

  const perfOn = fanbrainFlags.perfElo();
  const knockoutOn = fanbrainFlags.knockoutRegime() && !!ctx.knockout;
  const scoutOn = fanbrainFlags.scout() && scoutMul && Number.isFinite(Number(scoutMul.home));
  const calOn = fanbrainFlags.calibrationMap() && calMap;

  if (perfOn) out.push(track('wc-perf-elo-shadow', pure({ eloFn: getPerfElo })));
  if (knockoutOn) out.push(track('wc-knockout-shadow', pure({ knockoutOpts: KNOCKOUT_DEFAULTS })));
  if (scoutOn) out.push(track('wc-scout-shadow', pure({ scoutMul })));
  if (calOn) out.push(track('wc-calibration-shadow', pure({ calMap })));

  // The combined fan-brain — every enabled signal at once (what promotion judges).
  if (perfOn || knockoutOn || scoutOn || calOn) {
    const combo = {};
    if (perfOn) combo.eloFn = getPerfElo;
    if (knockoutOn) combo.knockoutOpts = KNOCKOUT_DEFAULTS;
    if (scoutOn) combo.scoutMul = scoutMul;
    if (calOn) combo.calMap = calMap;
    out.push(track('wc-fanbrain-shadow', pure(combo)));
  }
  return out;
}

/** The full set of shadow model_versions (for ledger/admin enumeration). */
export const SHADOW_VERSIONS = [
  'wc-perf-elo-shadow', 'wc-knockout-shadow', 'wc-scout-shadow',
  'wc-calibration-shadow', 'wc-fanbrain-shadow',
];

export default { buildShadowPredictions, SHADOW_VERSIONS };
