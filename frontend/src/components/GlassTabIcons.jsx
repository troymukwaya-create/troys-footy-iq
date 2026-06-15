import React from 'react';

// ─── GLASS TAB ICONS ────────────────────────────────────────────────
// Duotone, frosted-glass tab icons for the mobile bar. Same football-native
// metaphors as BrandIcons, executed as Apple-style duotone: a translucent
// glass FILL behind a crisp 1.7px outline, so they read as premium glass
// rather than thin UI-kit line glyphs. `active` brightens the fill + adds a
// soft inner highlight. Everything is currentColor so the parent owns hue.

// Heavier, SF-Symbol-style fills — active reads as a near-solid filled glyph,
// inactive stays a substantial duotone (not a thin outline).
const FILL = (active) => (active ? 0.58 : 0.2);

// Home — the kickoff: centre circle on the halfway line, ball in the middle.
export function GlassKickoff({ size = 22, active = false, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="3.2" x2="12" y2="20.8" opacity="0.9" />
      <circle cx="12" cy="12" r="6.2" fill="currentColor" fillOpacity={FILL(active)} />
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Matches — the pitch from above: the fixture list.
export function GlassPitch({ size = 22, active = false, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4.3" y="3" width="15.4" height="18" rx="2.6" fill="currentColor" fillOpacity={FILL(active)} />
      <rect x="4.3" y="3" width="15.4" height="18" rx="2.6" />
      <line x1="4.3" y1="12" x2="19.7" y2="12" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M9 3 v2.4 h6 V3" opacity="0.9" />
      <path d="M9 21 v-2.4 h6 V21" opacity="0.9" />
    </svg>
  );
}

// Edge — the model's line breaking up off the market's flat baseline,
// with a translucent wedge of "edge" filled beneath it.
export function GlassEdge({ size = 22, active = false, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 16.8 L10.2 15.6 L20.5 6.2 L20.5 17 L3 17 Z"
        fill="currentColor" fillOpacity={FILL(active)} stroke="none" />
      <path d="M3 16.8 H21" strokeDasharray="2.4 2.6" opacity="0.5" />
      <path d="M3 16.8 L10.2 15.6 L20.5 6.2" />
      <path d="M15.6 6.2 H20.6 V11.2" />
    </svg>
  );
}

export default { GlassKickoff, GlassPitch, GlassEdge };
