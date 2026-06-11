// ─── TEAM MARK ──────────────────────────────────────────────────────
// One consistent team identity chip everywhere. National teams get a
// flat rectangular flag (flagcdn — same source as the tile bleeds);
// clubs keep their crest. Fixes the mismatch where Grenada showed an
// FA badge next to neighbours showing clean flags.

import React from 'react';
import { flagUrl } from '../constants/nationFlags.js';

export default function TeamMark({ name, crest, size = 40 }) {
  const flag = flagUrl(name, size > 28 ? 160 : 80);

  if (flag) {
    return (
      <img
        src={flag}
        alt=""
        loading="lazy"
        style={{
          width: size,
          height: Math.round(size * 0.7),
          objectFit: 'cover',
          borderRadius: Math.max(2, Math.round(size * 0.08)),
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
          flexShrink: 0,
        }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }

  if (crest) {
    return (
      <img
        src={crest}
        alt=""
        loading="lazy"
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }

  return null;
}
