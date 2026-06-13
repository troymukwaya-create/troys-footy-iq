import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

// Resolve the API base the same way analytics.js does, so this works in dev
// (Vite proxy) and prod (Render backend) without using the 1s-timeout axios client.
const RAW_BASE = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/+$/, '')}/api`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function visitorId() { try { return localStorage.getItem('fiq_visitor') || null; } catch { return null; } }

function alreadySubscribed() { try { return !!localStorage.getItem('oddyessa_subscribed'); } catch { return false; } }
function rememberSubscribed() { try { localStorage.setItem('oddyessa_subscribed', '1'); } catch { /* private mode */ } }

export function EmailCapture({ source = 'site', headline, sub, hideIfSubscribed = false, compact = false, onDone }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | done | error

  // In-app placements vanish for subscribers instead of nagging; the landing
  // page keeps showing its "you're in" confirmation.
  if (hideIfSubscribed && alreadySubscribed()) return null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!EMAIL_RE.test(email.trim())) { setState('error'); return; }
    setState('loading');
    try {
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source, visitorId: visitorId(), prefs: { worldCup: true } }),
      });
      if (!res.ok) throw new Error('bad');
      rememberSubscribed();
      setState('done');
      onDone?.();
    } catch { setState('error'); }
  };

  if (state === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#22c55e', fontWeight: 600, fontSize: 15 }}>
        <Check size={20} /> You’re in — the first picks land in your inbox soon.
      </div>
    );
  }

  return (
    <div>
      {!compact && (
        <>
          <h3 style={{ fontSize: 'clamp(19px, 5vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            {headline || 'Get the day’s best bets in your inbox'}
          </h3>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, marginBottom: 16 }}>
            {sub || 'Free value picks every morning of the World Cup — who wins, why, and where the bookies are wrong. No spam.'}
          </p>
        </>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="email"
          required
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
          placeholder="you@email.com"
          style={{
            flex: 1, minWidth: 180, padding: '13px 16px', borderRadius: 4, fontSize: 16,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${state === 'error' ? '#ef4444' : 'rgba(255,255,255,0.16)'}`,
            color: '#fff', outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          style={{ padding: '13px 22px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}
        >
          {state === 'loading' ? 'Joining…' : <>Get the picks <ArrowRight size={16} /></>}
        </button>
      </form>
      {state === 'error' && (
        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>Hmm, that didn’t work — check the email and try again.</div>
      )}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, lineHeight: 1.5 }}>
        {compact
          ? 'Free · every morning of the World Cup · unsubscribe anytime. 18+, not betting advice.'
          : 'By joining you agree to receive emails from Oddyessa. Data only, not betting advice. 18+. Unsubscribe anytime.'}
      </div>
    </div>
  );
}
