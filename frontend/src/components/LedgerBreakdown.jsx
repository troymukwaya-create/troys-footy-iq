// ─── THE TWO-NUMBER LEDGER ───────────────────────────────────────────
// The honest breakdown the council demanded: our published (blended) Brier
// sits next to the pure-model and market-only numbers, so anyone can see how
// much of the accuracy is ours vs borrowed from the sharp market — plus
// closing-line value. Renders nothing until the engine has scored matches.

import React from 'react';
import { usePerformance } from '../hooks/useQueries.js';

const MONO = 'var(--font-mono)';
const fmt = (v) => (v == null ? '—' : Number(v).toFixed(3));

function Cell({ label, value, accent, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 92, padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function LedgerBreakdown() {
  const { data } = usePerformance();
  const l = data?.ledger;
  if (!l || !l.n) return null;

  const clv = l.clv;

  return (
    <div style={{ marginTop: 16, padding: 'clamp(14px, 4vw, 18px)', border: '1px solid var(--border-default)', borderRadius: 6, background: '#0B0B0D' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
        OUR NUMBER vs THE MARKET'S
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: 12 }}>
        We publish the blend. Here's the pure model and the market alone beside it — so you can see what's ours.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Cell label="Published (blend)" value={fmt(l.blended)} accent sub={`n=${l.n}`} />
        <Cell label="Pure model" value={fmt(l.pureModel)} sub="market-free" />
        <Cell label="Market only" value={fmt(l.marketOnly)} sub="consensus" />
        {clv && clv.n > 0 && (
          <Cell
            label="Beat the close"
            value={clv.beatCloseRate != null ? `${clv.beatCloseRate}%` : '—'}
            sub={clv.meanDeltaPts != null ? `Δ ${clv.meanDeltaPts > 0 ? '+' : ''}${clv.meanDeltaPts}pts · n=${clv.n}` : `n=${clv.n}`}
          />
        )}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: 12 }}>
        n={l.n} of 104 · backtest baseline 0.1871 (380 PL matches) · pre-registered tournament expectation ≈ 0.19
      </div>
    </div>
  );
}

export default LedgerBreakdown;
