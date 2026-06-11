// ─── ORBIT MARK ─────────────────────────────────────────────────────
// The Oddyessa logo: an open ring (bone) with a single oxblood point
// sitting in the gap. The ring = the arena (centre circle, the ring,
// the circuit) — sport-agnostic, so it never dates as we add sports.
// The dot = a data point taking a public position; the gap = the story
// isn't finished. Reused by TopNav, the boot splash, and the favicon.
//
// Geometry: viewBox 0 0 100 100, ring centred (50,50) r=28, gap at the
// upper-right where the dot lives. One source of truth for the shape.

import React from 'react';

export default function OrbitMark({ size = 28, ring = '#F7F4EE', dot = '#A8344A', stroke = 6.5, boxed = false, ...props }) {
  const mark = (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      role="img" aria-label="Oddyessa" {...props}>
      <path d="M 57.25 22.95 A 28 28 0 1 0 77.05 42.75"
        fill="none" stroke={ring} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="69.8" cy="30.2" r="8" fill={dot} />
    </svg>
  );

  if (!boxed) return mark;

  // Boxed: dark rounded-square housing (nav badge / app-icon contexts).
  const pad = Math.round(size * 0.16);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + pad * 2, height: size + pad * 2,
      borderRadius: Math.round((size + pad * 2) * 0.28),
      background: 'rgba(168,52,74,0.12)', border: '1px solid rgba(168,52,74,0.28)',
    }}>{mark}</span>
  );
}
