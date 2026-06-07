import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useReducedMotion, useMotionValue, animate } from 'motion/react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { flagGradient } from '../constants/nationColors.js';

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

// ─── Animated aurora glow behind everything ──────────────────────────
function Aurora() {
  const reduce = useReducedMotion();
  const blob = (background, size, pos, dur, delay) => (
    <motion.div
      aria-hidden
      animate={reduce ? {} : { x: [0, 40, -20, 0], y: [0, -30, 24, 0] }}
      transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', background, filter: 'blur(90px)', ...pos }}
    />
  );
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {blob('rgba(168,52,74,0.32)', 440, { top: '-8%', left: '-6%' }, 18, 0)}
      {blob('rgba(40,90,180,0.22)', 480, { bottom: '-14%', right: '-8%' }, 22, 2)}
      {blob('rgba(168,52,74,0.16)', 380, { top: '38%', left: '52%' }, 20, 1)}
    </div>
  );
}

// ─── The "product" inside the phone ──────────────────────────────────
function PredictionCard() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 14, gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}><span style={{ color: 'var(--accent)' }}>Odd</span><span style={{ color: '#fff' }}>yessa</span></span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'var(--accent)', padding: '3px 8px', borderRadius: 99, letterSpacing: '0.04em' }}>🏆 WORLD CUP</span>
      </div>

      <div style={{ borderRadius: 14, padding: 13, background: flagGradient('Spain', 'Brazil', 'linear-gradient(155deg,#14161B,#0B0B0D)'), border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 22 }}>🇪🇸</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: '#fff' }}>Spain</div>
          </div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)' }}>Sun · 20:00</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 22 }}>🇧🇷</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: '#fff' }}>Brazil</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 5, color: '#fff' }}>
          <span>48%</span><span style={{ color: 'rgba(255,255,255,0.5)' }}>27%</span><span>25%</span>
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          <motion.div initial={{ width: 0 }} animate={{ width: '48%' }} transition={{ duration: 0.9, delay: 1, ease }} style={{ background: '#E63946', borderRadius: '4px 0 0 4px' }} />
          <motion.div initial={{ width: 0 }} animate={{ width: '27%' }} transition={{ duration: 0.9, delay: 1.1, ease }} style={{ background: 'rgba(255,255,255,0.15)' }} />
          <motion.div initial={{ width: 0 }} animate={{ width: '25%' }} transition={{ duration: 0.9, delay: 1.2, ease }} style={{ background: '#2A9D5C', borderRadius: '0 4px 4px 0' }} />
        </div>
        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Pick · Spain win</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.14)', padding: '3px 8px', borderRadius: 99 }}>+7% value</span>
        </div>
      </div>

      <div style={{ borderRadius: 12, padding: 11, background: 'rgba(168,52,74,0.10)', border: '1px solid rgba(168,52,74,0.22)' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--accent)', marginBottom: 5, letterSpacing: '0.06em' }}>WHY</div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>Spain control midfield; the market underrates them by 7%. Strong value on the win.</div>
      </div>
    </div>
  );
}

function Device() {
  const reduce = useReducedMotion();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', perspective: 1200 }}>
      {/* glow pad */}
      <div aria-hidden style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,52,74,0.35), transparent 65%)', filter: 'blur(30px)', top: '50%', left: '50%', transform: 'translate(-50%,-45%)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 56, rotateX: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 110, delay: 0.35 }}
        style={{ position: 'relative' }}
      >
        <motion.div
          animate={reduce ? {} : { y: [0, -12, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'relative', width: 'clamp(232px, 64vw, 288px)', aspectRatio: '9 / 18.5',
            borderRadius: 40, padding: 10,
            background: 'linear-gradient(160deg,#1c1e25,#0a0a0c)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 44px 120px rgba(168,52,74,0.28), 0 12px 44px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* notch */}
          <div aria-hidden style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 84, height: 20, borderRadius: 99, background: '#000', zIndex: 3 }} />
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 31, overflow: 'hidden', background: '#0B0B0D' }}>
            <PredictionCard />
            {/* shine sweep */}
            {!reduce && (
              <motion.div
                aria-hidden
                initial={{ x: '-130%' }}
                animate={{ x: '130%' }}
                transition={{ duration: 2.4, delay: 1.4, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
                style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)' }}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Animated Brier number (count-up on scroll) ──────────────────────
function BrierStat() {
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => v.toFixed(3));
  return (
    <motion.span
      onViewportEnter={() => animate(mv, 0.187, { duration: 1.2, ease })}
      viewport={{ once: true }}
      style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)' }}
    >
      {text}
    </motion.span>
  );
}

export default function HowItWorks() {
  const enter = () => { try { localStorage.setItem('oddyessa_welcomed', '1'); } catch { /* ignore */ } };
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const deviceY = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const deviceScale = useTransform(scrollYProgress, [0, 1], [1, 0.88]);

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', overflowX: 'hidden', overflowY: 'auto', background: '#070708', color: 'var(--text-primary)' }}>
      <Aurora />

      {/* ─── HERO: the unboxing ─────────────────────────────── */}
      <section ref={heroRef} style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px 24px', gap: 30 }}>
        <motion.div style={{ y: textY, opacity: textOpacity }}>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>O</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 700 }}><span style={{ color: 'var(--accent)' }}>Odd</span>yessa</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.05, ease }}
            style={{ fontSize: 'clamp(40px, 12vw, 84px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, margin: 0, background: 'linear-gradient(180deg, #fff 30%, #b8889a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >
            Read the game.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease }} style={{ fontSize: 'clamp(15px, 4vw, 19px)', color: 'rgba(255,255,255,0.65)', maxWidth: 520, margin: '20px auto 0', lineHeight: 1.5 }}>
            AI predictions for every match — who’ll win, <strong style={{ color: '#fff' }}>why</strong>, and where the bookies are wrong.
          </motion.p>
        </motion.div>

        <motion.div style={{ y: deviceY, scale: deviceScale }}>
          <Device />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          <Link to="/" onClick={enter} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 8px 30px rgba(168,52,74,0.4)' }}>
            Enter Oddyessa <ArrowRight size={17} />
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5, y: [0, 8, 0] }} transition={{ delay: 1.2, duration: 2, repeat: Infinity }} style={{ position: 'absolute', bottom: 20 }}>
          <ChevronDown size={24} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </motion.div>
      </section>

      {/* ─── PILLARS ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px,10vw,100px) 24px' }}>
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 12 }}>What Oddyessa does</motion.h2>
        <motion.p {...reveal} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 48px', fontSize: 15 }}>Three things, done well.</motion.p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,260px),1fr))', gap: 16 }}>
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: i * 0.1, ease }}
              style={{ padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            >
              <div style={{ fontSize: 36, marginBottom: 14 }}>{p.emoji}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HOW TO USE ──────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: 'clamp(20px,6vw,60px) 24px clamp(40px,10vw,100px)' }}>
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 48 }}>How to use it</motion.h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -22 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.06, ease }}
              style={{ display: 'flex', gap: 18, alignItems: 'flex-start', padding: '18px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>{s.n}</div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HONESTY ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(40px,10vw,110px) 24px', textAlign: 'center' }}>
        <motion.div {...reveal} style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 18 }}>The honest part</div>
          <div style={{ fontSize: 'clamp(56px, 18vw, 120px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
            <BrierStat />
          </div>
          <h2 style={{ fontSize: 'clamp(22px,5.5vw,34px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '18px 0 16px' }}>We publish how often we’re right.</h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            Every prediction is scored against what actually happened — and that track record is public. No hype, no quietly-deleted bad tips. Just the numbers.
          </p>
        </motion.div>
      </section>

      {/* ─── CTA + RESPONSIBLE ───────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(40px,10vw,90px) 24px clamp(60px,14vw,120px)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <motion.div {...reveal}>
          <h2 style={{ fontSize: 'clamp(24px,6vw,38px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 26 }}>Ready to read the game?</h2>
          <Link to="/" onClick={enter} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 10px 36px rgba(168,52,74,0.45)' }}>
            Enter Oddyessa <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 36, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Oddyessa is a data &amp; analytics product — we don’t accept bets. Predictions are for information only and are not betting advice. 18+. Please gamble responsibly.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
