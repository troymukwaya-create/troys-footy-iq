import React from 'react';

/**
 * TopNav — Clean, minimal top navigation.
 * Logo + breadcrumb + status indicator.
 */
export function TopNav({ onGoDashboard, fixtureSelected, onInvestorMode }) {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      zIndex: 30,
    }}>
      {/* Logo */}
      <div onClick={onGoDashboard} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
          background: 'var(--accent-muted)', border: '1px solid rgba(59,130,246,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>T</span>
        </div>
        <span className="hidden sm:block" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span style={{ color: 'var(--accent)' }}>Footy</span>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>IQ</span>
        </span>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
        {fixtureSelected && (
          <>
            <button onClick={onGoDashboard} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12 }}>
              Dashboard
            </button>
            <span style={{ color: 'var(--text-muted)' }}>›</span>
            <span style={{ color: 'var(--accent)' }}>Match Analysis</span>
          </>
        )}
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
        <span className="hidden sm:block" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connected</span>
        <button 
          onClick={onInvestorMode}
          className="ml-4 px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 border border-cyan-500/30 rounded text-xs font-bold text-cyan-400 transition-colors tracking-wide hidden sm:block"
        >
          INVESTOR PITCH
        </button>
      </div>
    </nav>
  );
}
