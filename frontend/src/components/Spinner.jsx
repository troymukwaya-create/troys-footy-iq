import React from 'react';

// ─── ORBIT SPINNER ──────────────────────────────────────────────────
// The one loading/refresh mark for the whole app: the boot-splash orbit,
// looped. An open bone ring with the oxblood data-point leading, rotating
// continuously. Replaces the assorted border / emoji / off-brand spinners
// so every "we're working" moment speaks the brand. Geometry is the exact
// OrbitMark path so the splash and every inline loader are one shape.

export default function Spinner({
  size = 28,
  speed = 0.95,           // seconds per revolution
  ring = '#F7F4EE',
  dot = '#C0392B',
  stroke = 6.5,
  label = 'Loading',
  style = {},
  ...props
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className="orbit-spinner"
      style={{ display: 'inline-flex', width: size, height: size, animationDuration: `${speed}s`, ...style }}
      {...props}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path d="M 57.25 22.95 A 28 28 0 1 0 77.05 42.75"
          fill="none" stroke={ring} strokeWidth={stroke} strokeLinecap="round" />
        <circle cx="69.8" cy="30.2" r="8" fill={dot} />
      </svg>
    </span>
  );
}
