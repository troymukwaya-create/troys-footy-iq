import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ChevronDown } from 'lucide-react';

const ease = [0.16, 1, 0.3, 1];
const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease },
};

const PILLARS = [
  { emoji: '🔮', title: 'Predict every match', body: 'Win probabilities, likely scorelines and goals — for every game, every league, powered by our model.' },
  { emoji: '💡', title: 'Explain the why', body: 'Not just a number. Plain-language reasoning: form, head-to-head, home edge, injuries — the lot.' },
  { emoji: '💎', title: 'Find the value', body: 'We compare our model to the bookmakers and flag exactly where they have the price wrong.' },
];

const STEPS = [
  { n: 1, title: 'Browse the matches', body: 'Home shows the day’s best bets. Matches lets you explore every fixture. Edge is where the value lives.' },
  { n: 2, title: 'Open a match', body: 'See the prediction, the expected goals, the likely scorelines — and the plain-language why behind it.' },
  { n: 3, title: 'Spot the edge', body: 'A green “+value” badge means our model rates the outcome higher than the bookies are pricing it.' },
  { n: 4, title: 'Build a Slip', body: 'Add selections, or tap a Suggested Slip. We show the combined odds and the model’s edge on the whole slip.' },
  { n: 5, title: 'Take it to your bookmaker', body: 'Copy or share your slip, then place it wherever you bet. We’re a data site — we don’t take bets.' },
];

export default function HowItWorks() {
  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, overflow: 'hidden' }}>
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease }}
          style={{ position: 'absolute', inset: '-25%', background: 'radial-gradient(circle at 28% 32%, rgba(168,52,74,0.28), transparent 45%), radial-gradient(circle at 72% 64%, rgba(40,80,160,0.20), transparent 45%)', filter: 'blur(50px)' }}
        />
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, ease }} style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>O</span>
            </div>
            <span style={{ fontSize: 19, fontWeight: 700 }}><span style={{ color: 'var(--accent)' }}>Odd</span>yessa</span>
          </div>
          <h1 style={{ fontSize: 'clamp(40px, 12vw, 86px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.95, margin: 0 }}>Read the game.</h1>
          <p style={{ fontSize: 'clamp(15px, 4vw, 20px)', color: 'var(--text-secondary)', maxWidth: 560, margin: '22px auto 0', lineHeight: 1.5 }}>
            AI predictions for every match — who’ll win, <strong style={{ color: 'var(--text-primary)' }}>why</strong>, and where the bookies are wrong. And we publish how often we’re right.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 34 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 26px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
              Enter Oddyessa <ArrowRight size={17} />
            </Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55, y: [0, 8, 0] }} transition={{ delay: 1, duration: 2, repeat: Infinity }} style={{ position: 'absolute', bottom: 28 }}>
          <ChevronDown size={26} style={{ color: 'var(--text-muted)' }} />
        </motion.div>
      </section>

      {/* ─── PILLARS ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px,10vw,100px) 24px' }}>
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 12 }}>What Oddyessa does</motion.h2>
        <motion.p {...reveal} style={{ textAlign: 'center', color: 'var(--text-tertiary)', maxWidth: 480, margin: '0 auto 48px', fontSize: 15 }}>Three things, done well.</motion.p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,260px),1fr))', gap: 16 }}>
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: i * 0.1, ease }}
              style={{ padding: 24, borderRadius: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{ fontSize: 34, marginBottom: 14 }}>{p.emoji}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HOW TO USE ───────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(20px,6vw,60px) 24px clamp(40px,10vw,100px)' }}>
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 48 }}>How to use it</motion.h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.06, ease }}
              style={{ display: 'flex', gap: 18, alignItems: 'flex-start', padding: '18px 20px', borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>{s.n}</div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.55 }}>{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HONESTY ──────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(40px,10vw,100px) 24px', textAlign: 'center' }}>
        <motion.div {...reveal} style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>The honest part</div>
          <h2 style={{ fontSize: 'clamp(24px,6vw,38px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 16 }}>We publish how often we’re right.</h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Every prediction is scored against what actually happened — and that track record is public. No hype, no quietly-deleted bad tips. Just the numbers, so you can decide how much to trust us.
          </p>
        </motion.div>
      </section>

      {/* ─── CTA + RESPONSIBLE ────────────────────────────────── */}
      <section style={{ padding: 'clamp(40px,10vw,90px) 24px clamp(60px,14vw,120px)', textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
        <motion.div {...reveal}>
          <h2 style={{ fontSize: 'clamp(24px,6vw,36px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 24 }}>Ready to read the game?</h2>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 30px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
            Enter Oddyessa <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 36, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Oddyessa is a data &amp; analytics product — we don’t accept bets. Predictions are for information only and are not betting advice. 18+. Please gamble responsibly.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
