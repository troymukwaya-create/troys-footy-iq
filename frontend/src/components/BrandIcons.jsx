// ─── BRAND ICONS ────────────────────────────────────────────────────
// Bespoke nav icons drawn for Oddyessa — football-analytics native,
// not generic UI-kit glyphs. 24px grid, stroke-based, currentColor.
//
//   KickoffIcon  (Home)    — the centre circle + halfway line + ball:
//                            where every match starts.
//   PitchIcon    (Matches) — a vertical pitch with both boxes:
//                            the fixture list.
//   EdgeIcon     (Edge)    — the model's line breaking away from the
//                            market's dashed baseline: the gap IS the edge.

import React from 'react';

export function KickoffIcon({ size = 18, strokeWidth = 1.8, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" {...props}>
      <line x1="2.5" y1="12" x2="6.8" y2="12" />
      <line x1="17.2" y1="12" x2="21.5" y2="12" />
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PitchIcon({ size = 18, strokeWidth = 1.8, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="2.8" width="14" height="18.4" rx="2" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <path d="M9.2 2.8 v2.6 h5.6 v-2.6" />
      <path d="M9.2 21.2 v-2.6 h5.6 v2.6" />
    </svg>
  );
}

export function EdgeIcon({ size = 18, strokeWidth = 1.8, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* market: flat, dashed */}
      <path d="M3 16.5 H21" strokeDasharray="2.6 2.6" opacity="0.55" />
      {/* model: tracks the market, then breaks away */}
      <path d="M3 16.5 L10.5 15.5 L20.5 6.5" />
      <path d="M15.5 6.5 H20.5 V11.5" />
    </svg>
  );
}

export default { KickoffIcon, PitchIcon, EdgeIcon };
