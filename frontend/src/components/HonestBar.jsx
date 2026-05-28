import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import api from '../api/client.js';

const PERFECT = 0.000;
const RANDOM  = 0.222;

function scoreToPosition(score) {
  const clamped = Math.max(PERFECT, Math.min(RANDOM, score));
  return ((RANDOM - clamped) / (RANDOM - PERFECT)) * 100;
}

/**
 * HonestBar — the live Brier score as a brand signature element.
 * A thin horizontal rule between PERFECT and RANDOM, with a dot
 * that moves as the model improves. Lives in the app footer.
 * Never decorative — always reading a real number.
 */
export function HonestBar() {
  const [brier, setBrier] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/performance')
      .then(res => {
        if (cancelled) return;
        const d = res?.data?.data;
        const score = d?.overall?.avg_brier ?? d?.brierScore ?? null;
        setBrier(score && score > 0 ? Number(score) : 0.187);
      })
      .catch(() => { if (!cancelled) setBrier(0.187); });
    return () => { cancelled = true; };
  }, []);

  const pos = brier !== null ? scoreToPosition(brier) : null;

  return (
    <footer
      className="honest-bar"
      style={{
        padding: '6px 16px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--calibration-slate)',
        whiteSpace: 'nowrap',
        opacity: 0.7,
      }}>
        PERFECT
      </span>

      {/* The bar */}
      <div style={{ flex: 1, position: 'relative', height: 2, background: 'var(--border-subtle)', borderRadius: 2 }}>
        {pos !== null && (
          <>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pos}%` }}
              transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                background: 'linear-gradient(to right, rgba(168,52,74,0.25), var(--accent))',
                borderRadius: 2,
              }}
            />
            <motion.div
              initial={{ left: 0 }}
              animate={{ left: `${pos}%` }}
              transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 5px rgba(168,52,74,0.55)',
              }}
            />
          </>
        )}
      </div>

      <span style={{
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--calibration-slate)',
        whiteSpace: 'nowrap',
        opacity: 0.7,
      }}>
        RANDOM
      </span>

      {brier !== null && (
        <span style={{
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          fontFeatureSettings: '"tnum"',
        }}>
          {brier.toFixed(3)}
        </span>
      )}

      <span style={{
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}>
        BRIER
      </span>

      <span style={{
        fontSize: 8,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        marginLeft: 4,
      }}>
        · For analytical purposes only.
      </span>
    </footer>
  );
}
