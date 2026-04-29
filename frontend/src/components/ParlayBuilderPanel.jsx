import React from 'react';
import { useStore } from '../store/useStore.js';

/**
 * ParlayBuilderPanel — Sticky right panel for parlay management.
 * Shows selected picks, combined odds, implied probability, and risk level.
 * Rules: max 3 picks, 1 per match, toggle to deselect.
 */
export function ParlayBuilderPanel() {
  const {
    parlaySelections,
    removeParlaySelection,
    clearParlay,
    getParlayOdds,
  } = useStore();

  const parlay = getParlayOdds();
  const isEmpty = parlaySelections.length === 0;

  const riskStyles = {
    'LOW':       { color: 'var(--success)', bg: 'var(--success-muted)', border: 'rgba(34,197,94,0.2)' },
    'MEDIUM':    { color: 'var(--warning)', bg: 'var(--warning-muted)', border: 'rgba(234,179,8,0.2)' },
    'HIGH':      { color: 'var(--danger)',  bg: 'var(--danger-muted)',  border: 'rgba(239,68,68,0.2)' },
    'VERY HIGH': { color: 'var(--danger)',  bg: 'var(--danger-muted)',  border: 'rgba(239,68,68,0.3)' },
  };
  const rs = riskStyles[parlay.risk] || riskStyles['MEDIUM'];

  return (
    <div style={{
      position: 'sticky', top: 80,
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-raised)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              PARLAY BUILDER
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
              background: 'var(--accent-muted)', color: 'var(--accent)',
            }}>
              {parlaySelections.length}/3
            </span>
          </div>
          {!isEmpty && (
            <button
              onClick={clearParlay}
              style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                transition: 'color 150ms ease',
              }}
              onMouseOver={e => e.target.style.color = 'var(--danger)'}
              onMouseOut={e => e.target.style.color = 'var(--text-muted)'}
            >
              Clear All
            </button>
          )}
        </div>

        {/* Selections */}
        {isEmpty ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>
              No picks yet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Select outcomes from the Markets tab to build your parlay. Max 3 picks, 1 per match.
            </div>
          </div>
        ) : (
          <div>
            {parlaySelections.map((sel, idx) => (
              <div
                key={sel.matchId}
                style={{
                  padding: '10px 16px',
                  borderBottom: idx < parlaySelections.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'background 150ms ease',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sel.matchLabel}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.04)', color: 'var(--text-tertiary)',
                    }}>
                      {sel.marketType}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {sel.outcome}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 800, color: 'var(--accent)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {parseFloat(sel.odds).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeParlaySelection(sel.matchId)}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', border: 'none',
                      background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 12, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      transition: 'all 150ms ease',
                    }}
                    onMouseOver={e => {
                      e.target.style.background = 'var(--danger-muted)';
                      e.target.style.color = 'var(--danger)';
                    }}
                    onMouseOut={e => {
                      e.target.style.background = 'rgba(255,255,255,0.04)';
                      e.target.style.color = 'var(--text-muted)';
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Footer */}
        {!isEmpty && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg-raised)',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                  TOTAL ODDS
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {parlay.totalOdds.toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                  IMPLIED %
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {parlay.impliedProb}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                  RISK
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 800, color: rs.color,
                }}>
                  {parlay.risk}
                </div>
              </div>
            </div>

            {/* Payout Calculator */}
            <div style={{
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>$10 returns</span>
              <span style={{
                fontSize: 14, fontWeight: 800, color: 'var(--accent)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                ${(parlay.totalOdds * 10).toFixed(2)}
              </span>
            </div>

            {/* Disclaimer */}
            <div style={{
              fontSize: 9, color: 'var(--text-muted)', textAlign: 'center',
              marginTop: 8, lineHeight: 1.4,
            }}>
              Simulation only — for analytical and educational purposes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
