import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/**
 * TopNav — Clean, minimal top navigation.
 * Logo + breadcrumb (desktop) + How-it-works + account + connection status.
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

      {/* Breadcrumb — desktop only */}
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

      {/* Guide link + account + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/how-it-works" className="hidden sm:block" style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none', fontWeight: 500 }}>
          How it works
        </Link>
        <AccountButton />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
          <span className="hidden sm:block" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connected</span>
        </div>
      </div>
    </nav>
  );
}

const menuItem = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px',
  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8,
  color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
};

function AccountButton() {
  const { user, openAuth, openSlips, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <button onClick={openAuth} style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Sign in
      </button>
    );
  }

  const initial = (user.email?.[0] || 'U').toUpperCase();
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Account" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', color: 'var(--accent)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
        {initial}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 40, zIndex: 50, width: 210, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>{user.email}</div>
            <button style={menuItem} onClick={() => { setOpen(false); openSlips(); }}>Saved slips</button>
            <button style={menuItem} onClick={() => { setOpen(false); logout(); }}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
