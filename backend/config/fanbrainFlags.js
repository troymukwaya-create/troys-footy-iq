// ─── FAN-BRAIN SHADOW FLAGS ─────────────────────────────────────────────────
// Single source of truth for the shadow-build flags. ALL default OFF — flags off
// ⇒ zero behaviour change, and no new mechanism is ever read by the scored
// `wc-elo-market-v1` path. Mirrors the env-flag pattern used by the social
// heartbeat. Promotion of any track to the live path is a future MANUAL decision
// (see the pre-registered gates in the shadow build report) — never automatic.
//
//   STYLE_FINGERPRINTS     — PERCEIVE: extract full box-score + style vectors
//                            (observability only; never touches lambda).
//   PERF_ELO_SHADOW        — REMEMBER: the deserved-result Elo ladder + its
//                            backfill / cron, and the wc-perf-elo-shadow rows.
//   KNOCKOUT_REGIME_SHADOW — REASON: kappa draw-inflation + ET second-Poisson +
//                            penalty shrinkage → wc-knockout-shadow rows.
//   SCOUT_SHADOW           — REASON: the bounded Claude lambda-nudge (market-
//                            blind) → wc-scout-shadow rows.
//   CALIBRATION_MAP_SHADOW — LEARN: per-band isotonic + Beta-Bernoulli remap,
//                            shadow-graded on ECE.
//
// The combined wc-fanbrain-shadow track is written whenever ANY component flag
// is on (it composes whatever is enabled; absent components fall back to the
// live component, so it degrades to the live model when everything is off).

const on = (name) => String(process.env[name] ?? '').toLowerCase() === 'true';

export const fanbrainFlags = {
  styleFingerprints: () => on('STYLE_FINGERPRINTS'),
  perfElo:           () => on('PERF_ELO_SHADOW'),
  knockoutRegime:    () => on('KNOCKOUT_REGIME_SHADOW'),
  scout:             () => on('SCOUT_SHADOW'),
  calibrationMap:    () => on('CALIBRATION_MAP_SHADOW'),
  // Any shadow component on ⇒ also write the combined fan-brain track.
  anyShadowOn: () => (
    on('PERF_ELO_SHADOW') || on('KNOCKOUT_REGIME_SHADOW') ||
    on('SCOUT_SHADOW') || on('CALIBRATION_MAP_SHADOW') || on('STYLE_FINGERPRINTS')
  ),
};

/** Snapshot of every flag's state (for /health + the Mission Control panel). */
export function fanbrainFlagState() {
  return {
    STYLE_FINGERPRINTS: fanbrainFlags.styleFingerprints(),
    PERF_ELO_SHADOW: fanbrainFlags.perfElo(),
    KNOCKOUT_REGIME_SHADOW: fanbrainFlags.knockoutRegime(),
    SCOUT_SHADOW: fanbrainFlags.scout(),
    CALIBRATION_MAP_SHADOW: fanbrainFlags.calibrationMap(),
  };
}

export default fanbrainFlags;
