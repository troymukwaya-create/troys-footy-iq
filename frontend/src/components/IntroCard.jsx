import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// One-time, dismissible intro that tells a first-time visitor what Oddyessa is
// in three swipes. Gated by localStorage so it only ever shows once.
const SLIDES = [
  {
    emoji: '🎯',
    title: 'Every match, priced',
    body: 'The model rates who wins, the likely scorelines and the goals — for every game, in every league.',
  },
  {
    emoji: '💡',
    title: 'See the why — and the value',
    body: 'We show the reasoning behind each pick, and flag where the bookmakers have it wrong.',
  },
  {
    emoji: '📊',
    title: 'We publish how often we’re right',
    body: 'No hype. Our accuracy is public — track the model in real time.',
  },
];

export function IntroCard() {
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem('oddyessa_intro_seen') === '1'; } catch { return true; }
  });
  const [i, setI] = useState(0);

  if (seen) return null;

  const close = () => {
    try { localStorage.setItem('oddyessa_intro_seen', '1'); } catch { /* ignore */ }
    setSeen(true);
  };
  const next = () => { if (i < SLIDES.length - 1) setI(i + 1); else close(); };
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(8,8,10,0.86)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 440, margin: '0 12px',
            marginBottom: 'calc(16px + env(safe-area-inset-bottom))',
            background: 'linear-gradient(160deg, #14161B, #0B0B0D)',
            border: '1px solid var(--border-subtle)', borderRadius: 24,
            padding: '14px 24px 20px', boxShadow: '0 -10px 60px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: 4 }}>
              Skip
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ textAlign: 'center', padding: '8px 4px 4px' }}
            >
              <div style={{ fontSize: 46, marginBottom: 14 }}>{s.emoji}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, lineHeight: 1.2 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 340, margin: '0 auto' }}>{s.body}</div>
            </motion.div>
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '22px 0' }}>
            {SLIDES.map((_, idx) => (
              <span key={idx} style={{
                width: idx === i ? 20 : 7, height: 7, borderRadius: 99,
                background: idx === i ? 'var(--accent)' : 'var(--border-default)',
                transition: 'all 220ms ease',
              }} />
            ))}
          </div>

          <button
            onClick={next}
            style={{ width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700 }}
          >
            {last ? "See today’s picks" : 'Next'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
