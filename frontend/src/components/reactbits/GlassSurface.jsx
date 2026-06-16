import React from 'react';

// Frosted glass surface — standardizes the glass treatment used on the nav,
// so receipts/panels can share one look. Edge highlight + soft depth.
export default function GlassSurface({ children, className, style, blur = 18, tint = 'rgba(11,11,13,0.42)', radius = 16 }) {
  return (
    <div
      className={className}
      style={{
        background: tint,
        backdropFilter: `blur(${blur}px) saturate(1.6)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(1.6)`,
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 30px rgba(0,0,0,0.35)',
        borderRadius: radius,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
