import React from 'react';

// Faint graph-paper dot field — says "calibration / measurement / plot",
// exactly the brand. Pure CSS (no canvas/WebGL), zero perf cost. Fades out
// at the edges so it never competes with content.
export default function DotGrid({ gap = 24, dot = 1.2, color = 'rgba(168,52,74,0.12)', fade = 'ellipse at center', style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `radial-gradient(${color} ${dot}px, transparent ${dot}px)`,
        backgroundSize: `${gap}px ${gap}px`,
        maskImage: `radial-gradient(${fade}, #000 35%, transparent 82%)`,
        WebkitMaskImage: `radial-gradient(${fade}, #000 35%, transparent 82%)`,
        ...style,
      }}
    />
  );
}
