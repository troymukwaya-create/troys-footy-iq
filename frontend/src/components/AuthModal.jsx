import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AuthModal() {
  const { authOpen, closeAuth, requestLink } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | sent | error

  if (!authOpen) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setState('error'); return; }
    setState('loading');
    const ok = await requestLink(email.trim().toLowerCase());
    setState(ok ? 'sent' : 'error');
  };
  const close = () => { setState('idle'); setEmail(''); closeAuth(); };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,8,10,0.8)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 400, background: 'linear-gradient(160deg,#14161B,#0B0B0D)', border: '1px solid var(--border-subtle)', borderRadius: 22, padding: '28px 24px' }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}><span style={{ color: 'var(--accent)' }}>Odd</span>yessa</div>

          {state === 'sent' ? (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 8px' }}>Check your email 📩</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                We’ve sent a sign-in link to <b style={{ color: 'var(--text-primary)' }}>{email}</b>. Tap it and you’re in — and you’ll stay signed in.
              </p>
              <button onClick={close} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Done</button>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 6px' }}>Sign in or create your account</h2>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.55, marginBottom: 18 }}>
                No password. We’ll email you a magic link — and keep you signed in, so you never have to do this again.
              </p>
              <form onSubmit={submit}>
                <input
                  type="email" required autoFocus value={email}
                  onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
                  placeholder="you@email.com"
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 16, background: 'var(--bg-raised)', border: `1px solid ${state === 'error' ? '#ef4444' : 'var(--border-default)'}`, color: 'var(--text-primary)', outline: 'none', marginBottom: 10 }}
                />
                <button type="submit" disabled={state === 'loading'} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
                  {state === 'loading' ? 'Sending…' : 'Email me a link'}
                </button>
              </form>
              {state === 'error' && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>That didn’t work — check the email and try again.</div>}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.5 }}>Data only, not betting advice. 18+.</p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
