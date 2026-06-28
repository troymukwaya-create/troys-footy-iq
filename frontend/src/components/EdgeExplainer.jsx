// ─── EDGE EXPLAINER ─────────────────────────────────────────────────
// The Edge tab stacked three widgets with zero narrative — first-time
// visitors saw "Slips", "Edge", "Parlay" jargon and didn't know what any
// of it was FOR. This header gives the tab one story in plain language,
// and is honest about what we are (analysis) and aren't (a bookmaker) —
// which also pre-frames the affiliate hand-off later: today you copy the
// slip, tomorrow the same button deep-links it.

import React from 'react';
import { EdgePanel } from './fixture/edgeCards.jsx';

// The Edge rail's lead: the "what is the edge" explainer + a live model-vs-market
// demo bar (the oxblood IS the edge), from the Claude Design Home rail.
export function EdgeExplainer() {
  return (
    <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
      <EdgePanel />
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: '14px 0 0' }}>
        Oddyessa doesn't take bets — we show you where the value is, you place it where you play. 18+, bet responsibly.
      </p>
    </div>
  );
}

export default EdgeExplainer;
