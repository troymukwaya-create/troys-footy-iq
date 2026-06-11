// ─── EDGE EXPLAINER ─────────────────────────────────────────────────
// The Edge tab stacked three widgets with zero narrative — first-time
// visitors saw "Slips", "Edge", "Parlay" jargon and didn't know what any
// of it was FOR. This header gives the tab one story in plain language,
// and is honest about what we are (analysis) and aren't (a bookmaker) —
// which also pre-frames the affiliate hand-off later: today you copy the
// slip, tomorrow the same button deep-links it.

import React from 'react';
import { EdgeIcon } from './BrandIcons.jsx';

export function EdgeExplainer() {
  return (
    <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
      <h2 className="font-display" style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <EdgeIcon size={17} style={{ color: 'var(--accent)' }} />
        What's the edge?
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 0' }}>
        When our model rates a result <strong style={{ color: 'var(--text-primary)' }}>more likely than the bookmakers' odds imply</strong>,
        that gap is the edge — the calls where the numbers lean your way.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
        {[
          'Start with the ranked calls below',
          'Tap any call to see the reasoning',
          'Copy a slip to whichever bookmaker you already use',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
        Oddyessa doesn't take bets — we show you where the value is, you place it where you play. 18+, bet responsibly.
      </p>
    </div>
  );
}

export default EdgeExplainer;
