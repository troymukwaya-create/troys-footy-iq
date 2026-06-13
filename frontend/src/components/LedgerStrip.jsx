// ─── LEDGER STRIP ────────────────────────────────────────────────────
// The trust engine, pinned at the very top of the app — before anything
// else, on every screen size. One mono line that says what no competitor
// can: how many calls are graded, the live Brier, the baseline, and that
// every call locks before kickoff. Tapping it jumps to the receipts.
//
// Council verdict (2026-06-13, unanimous): "Put the ledger above the
// fold. The miss is the brand. Currently invisible on screen zero."

import React from 'react';
import { usePerformance } from '../hooks/useQueries.js';
import { track } from '../lib/analytics.js';

const MONO = 'var(--font-mono)';

export function LedgerStrip({ onJumpToReceipts }) {
  const { data } = usePerformance();
  const overall = data?.overall;
  const n = Number(overall?.total_predictions || 0);
  const brier = overall?.avg_brier != null ? Number(overall.avg_brier) : null;

  const jump = () => {
    track('ledger_strip_tap', { n });
    if (onJumpToReceipts) { onJumpToReceipts(); return; }
    document.getElementById('receipts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <button
      onClick={jump}
      aria-label="View the public ledger of graded calls"
      style={{
        display: 'flex', alignItems: 'center',
        width: '100%', padding: '6px 10px',
        background: '#070708', border: 'none',
        borderBottom: '1px solid var(--border-default)',
        cursor: 'pointer', whiteSpace: 'nowrap', overflowX: 'auto',
        fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.07em',
        color: 'var(--text-secondary)', textTransform: 'uppercase',
        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
      }}
    >
      {/* margin:auto inner row = centred when it fits, scrollable from the
          left edge when it overflows (justify-content:center would clip). */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>LEDGER</span>
      {brier != null && n > 0 ? (
        <>
          <span>{n} GRADED</span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>·</span>
          <span>BRIER <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{brier.toFixed(3)}</strong></span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>·</span>
          <span>COIN-FLIP 0.222</span>
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>·</span>
          <span>LOCKED T-10</span>
          {n < 50 && (
            <span style={{ color: 'var(--text-tertiary)', textTransform: 'none', letterSpacing: '0.03em' }} className="ledger-strip-sub">
              — early sample · judged over all 104 matches
            </span>
          )}
        </>
      ) : (
        <span>EVERY CALL LOCKED BEFORE KICKOFF · GRADED IN PUBLIC</span>
      )}
      </span>
      <style>{`@media (max-width: 560px) { .ledger-strip-sub { display: none; } }`}</style>
    </button>
  );
}

export default LedgerStrip;
