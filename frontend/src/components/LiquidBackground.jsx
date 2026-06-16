import React from 'react';
import Plasma from './reactbits/Plasma.jsx';

// Site background FX. Currently the React Bits Plasma (ogl/WebGL), tinted to
// the brand oxblood, pinned full-viewport behind the content. pointer-events:
// none so it never blocks the UI; it animates on its own. (Name kept for the
// two existing import sites; renders Plasma now.)
export default function LiquidBackground({ base = '#0B0B0D' }) {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: base }}>
      <Plasma
        color="#A8344A"
        speed={0.7}
        direction="forward"
        scale={1.3}
        opacity={0.65}
        mouseInteractive={false}
      />
    </div>
  );
}
