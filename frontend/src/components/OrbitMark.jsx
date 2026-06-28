// ─── ORBIT MARK ─────────────────────────────────────────────────────
// The Oddyessa logo: an open ring (bone) with a single oxblood point sitting
// in the gap, plus a faint trail behind it — the "trajectory" refinement (the
// satellite has a direction). The ring = the arena (centre circle, the ring,
// the circuit) — sport-agnostic. The dot = a data point taking a public
// position; the gap = the story isn't finished. Reused by TopNav, the boot
// splash, the fixture-card spine, and the favicon.
//
// Geometry: viewBox 0 0 100 100, ring centred (50,50) r=28, gap at the
// upper-right where the dot lives (NE, -45°); the trail fades from the dot a
// short arc into the gap. One source of truth for the shape.

import React from 'react';

export default function OrbitMark({ size = 28, ring = '#F7F4EE', dot = '#C0392B', stroke = 6.5, trail = true, boxed = false, ...props }) {
  // Unique gradient id per instance — multiple marks can share a page.
  const uid = React.useId().replace(/:/g, '');
  const mark = (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      role="img" aria-label="Oddyessa" {...props}>
      {trail && (
        <>
          <defs>
            <linearGradient id={`omtrail${uid}`} gradientUnits="userSpaceOnUse" x1="69.8" y1="30.2" x2="76.14" y2="39.97">
              <stop offset="0" stopColor={dot} />
              <stop offset="1" stopColor={dot} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M 69.8 30.2 A 28 28 0 0 1 76.14 39.97" fill="none"
            stroke={`url(#omtrail${uid})`} strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      <path d="M 57.25 22.95 A 28 28 0 1 0 77.05 42.75"
        fill="none" stroke={ring} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="69.8" cy="30.2" r="8.5" fill={dot} />
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
      background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.28)',
    }}>{mark}</span>
  );
}
