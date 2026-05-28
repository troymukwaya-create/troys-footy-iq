import React from 'react';

/**
 * QEDMark — the mathematician's tombstone ∎
 * Placed at the end of every AI verdict / analysis.
 * Signals: "the prediction is made, the proof is closed."
 */
export function QEDMark({ className = '', size = 'sm' }) {
  const fontSize = size === 'lg' ? 14 : 10;
  return (
    <span
      className={className}
      title="Prediction complete ∎"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize,
        color: 'var(--calibration-slate)',
        letterSpacing: '0.06em',
        opacity: 0.6,
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      ∎
    </span>
  );
}
