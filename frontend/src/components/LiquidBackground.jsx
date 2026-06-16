import React from 'react';

// Site background FX — a slow, GPU-composited oxblood "aurora", pure CSS.
// A few large, soft radial blooms drift behind the content, animating ONLY
// transform + opacity, so the browser rasterises each blurred layer once and
// then just moves/fades it on the compositor thread. Result: silky on every
// device, and — crucially — no repaint on scroll, which is what made the old
// WebGL Plasma flicker under the blurred glass header. pointer-events:none so
// it never blocks the UI; honours prefers-reduced-motion.
//
// (Replaces the per-frame 60-iteration ray-march shader. Plasma.jsx is kept in
// the tree, unused, so the old look can be restored by reverting this file.)
export default function LiquidBackground({ base = '#0B0B0D' }) {
  return (
    <div
      aria-hidden="true"
      className="liquid-bg"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: base, overflow: 'hidden' }}
    >
      <div className="liquid-bg__bloom liquid-bg__bloom--1" />
      <div className="liquid-bg__bloom liquid-bg__bloom--2" />
      <div className="liquid-bg__bloom liquid-bg__bloom--3" />
      <style>{`
        .liquid-bg__bloom {
          position: absolute;
          border-radius: 50%;
          filter: blur(48px);
          will-change: transform, opacity;
          transform: translateZ(0);
        }
        /* Top-left primary oxblood bloom */
        .liquid-bg__bloom--1 {
          width: 75vw; height: 75vw; max-width: 1100px; max-height: 1100px;
          top: -22vh; left: -12vw;
          background: radial-gradient(circle at center,
            rgba(168,52,74,0.50) 0%, rgba(168,52,74,0.16) 42%, rgba(168,52,74,0) 70%);
          animation: liquidDrift1 28s ease-in-out infinite alternate;
        }
        /* Bottom-right deeper signature bloom */
        .liquid-bg__bloom--2 {
          width: 65vw; height: 65vw; max-width: 950px; max-height: 950px;
          bottom: -20vh; right: -10vw;
          background: radial-gradient(circle at center,
            rgba(122,31,43,0.46) 0%, rgba(122,31,43,0.14) 44%, rgba(122,31,43,0) 70%);
          animation: liquidDrift2 34s ease-in-out infinite alternate;
        }
        /* Centre drifting accent — keeps the field "alive" */
        .liquid-bg__bloom--3 {
          width: 58vw; height: 58vw; max-width: 820px; max-height: 820px;
          top: 26vh; left: 32vw;
          background: radial-gradient(circle at center,
            rgba(168,52,74,0.30) 0%, rgba(168,52,74,0.09) 46%, rgba(168,52,74,0) 72%);
          animation: liquidDrift3 40s ease-in-out infinite alternate;
        }
        @keyframes liquidDrift1 {
          0%   { transform: translate3d(0, 0, 0) scale(1);     opacity: 0.95; }
          100% { transform: translate3d(7vw, 5vh, 0) scale(1.16); opacity: 0.70; }
        }
        @keyframes liquidDrift2 {
          0%   { transform: translate3d(0, 0, 0) scale(1.06);  opacity: 0.78; }
          100% { transform: translate3d(-6vw, -4vh, 0) scale(1); opacity: 0.96; }
        }
        @keyframes liquidDrift3 {
          0%   { transform: translate3d(0, 0, 0) scale(0.96);  opacity: 0.60; }
          100% { transform: translate3d(-5vw, 6vh, 0) scale(1.18); opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          .liquid-bg__bloom { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
