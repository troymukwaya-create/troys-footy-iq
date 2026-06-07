import React from 'react';
import { Link } from 'react-router-dom';

/**
 * TopNav — Clean, minimal top navigation.
 * Logo + breadcrumb (desktop) + connection status.
 */
export function TopNav({ onGoDashboard, fixtureSelected }) {
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
          background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>O</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span style={{ color: 'var(--accent)' }}>Odd</span><span style={{ color: 'var(--text-secondary)' }}>yessa</span>
        </span>
      </div>

      {/* Breadcrumb — desktop only (mobile uses the bottom nav for context) */}
      <div className="hidden sm:flex items-center gap-2" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
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

      {/* Guide link + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/how-it-works" style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none', fontWeight: 500 }}>
          How it works
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
          <span className="hidden sm:block" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connected</span>
        </div>
      </div>
    </nav>
  );
}
