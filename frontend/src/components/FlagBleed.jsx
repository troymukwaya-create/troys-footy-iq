// ─── FLAG BLEED (EXPERIMENT) ────────────────────────────────────────
// Cinematic tile background: each team's REAL flag bleeds into the
// other across the card — like ink dispersing in water — instead of
// flat colour gradients. FotMob-adjacent, but darker and moodier to
// stay on-brand with the terminal aesthetic.
//
// Technique: two absolutely-positioned flag layers, each mask-faded
// through the centre so they cross-dissolve where they meet; a slight
// blur + desaturation makes them read as atmosphere, not image; a dark
// veil on top guarantees text contrast. Falls back to nothing (caller
// keeps its colour gradient) when either flag is unknown.
//
// Render inside a container with position:relative + overflow:hidden +
// isolation:isolate. The layer uses zIndex:-1, which (inside an isolated
// stacking context) paints ABOVE the card's own background but BELOW all
// in-flow content — so text, bars and buttons need no z-index changes.

import { flagUrl } from '../constants/nationFlags.js';

export function hasFlags(homeName, awayName) {
  return !!(flagUrl(homeName) && flagUrl(awayName));
}

/**
 * @param {string} home / away - team names
 * @param {number} opacity - overall strength: ~0.55 bold (insight cards),
 *                           ~0.30 subtle (sidebar fixture rows)
 */
export default function FlagBleed({ home, away, opacity = 0.55 }) {
  const homeFlag = flagUrl(home);
  const awayFlag = flagUrl(away);
  if (!homeFlag || !awayFlag) return null;

  const layer = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '68%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // Blur + desaturate: the flag should feel like light through smoke,
    // not a sticker. Slight scale hides the blur's soft edges.
    filter: 'blur(7px) saturate(0.95) brightness(0.85)',
    transform: 'scale(1.15)',
    pointerEvents: 'none',
  };

  // The two masks overlap between 30% and 70% of the card width — that
  // overlap is the "bleed": both flags are semi-present, dissolving into
  // each other rather than meeting at a hard seam.
  const maskHome =
    'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 100%)';
  const maskAway =
    'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 100%)';

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, opacity, overflow: 'hidden', borderRadius: 'inherit' }}>
      <div
        style={{
          ...layer,
          left: '-4%',
          backgroundImage: `url(${homeFlag})`,
          WebkitMaskImage: maskHome,
          maskImage: maskHome,
        }}
      />
      <div
        style={{
          ...layer,
          right: '-4%',
          backgroundImage: `url(${awayFlag})`,
          WebkitMaskImage: maskAway,
          maskImage: maskAway,
        }}
      />
      {/* Dark veil: keeps the terminal-dark brand + guarantees legibility.
          Heavier at the bottom where probabilities and insights live. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(11,11,13,0.36) 0%, rgba(11,11,13,0.55) 55%, rgba(11,11,13,0.78) 100%)',
        }}
      />
    </div>
  );
}
