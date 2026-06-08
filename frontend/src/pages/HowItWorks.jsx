import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useReducedMotion, useMotionValue, animate } from 'motion/react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { flagGradient } from '../constants/nationColors.js';
import { EmailCapture } from '../components/EmailCapture.jsx';

const ease = [0.16, 1, 0.3, 1];
const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease },
};

const PILLARS = [
  { emoji: '🔮', title: 'A call on every game', body: 'From the World Cup final to a quiet midweek fixture, you’ll know who we fancy, the likely score, and how the goals might fall — before a ball is kicked.' },
  { emoji: '💡', title: 'The story, not just the score', body: 'Anyone can fire off a tip. We tell you why — the form, the history, the home crowd, who’s injured — so the call stays yours to make.' },
  { emoji: '💎', title: 'Where the bookies slip up', body: 'We hold our numbers up next to the bookmakers’ odds and point you to the bets actually worth backing — not just the favourites everyone’s already on.' },
];

const STEPS = [
  { n: 1, title: 'Have a look around', body: 'Home gives you the day’s best shouts. Matches lets you wander through every fixture. Edge is where the real value hides.' },
  { n: 2, title: 'Pick a game', body: 'Tap any match for our call, the scorelines we’re expecting, and the full reasoning — in plain English, no jargon.' },
  { n: 3, title: 'Spot the value', body: 'See a green “+value” tag? That’s us telling you the bookmakers have priced this one in your favour.' },
  { n: 4, title: 'Build your slip', body: 'Stack a few picks together, or load one we’ve already put together for you. We’ll show you exactly how much edge the whole slip carries.' },
  { n: 5, title: 'Place it your way', body: 'Copy your slip and put it on wherever you like to bet. We do the homework — you stay in charge of the bet.' },
];

// ─── Animated aurora glow behind everything ──────────────────────────
// Static glow (no per-frame blur animation — that froze low-end phones).
function Aurora() {
  const blob = (background, size, pos) => (
    <div aria-hidden style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', background, filter: 'blur(55px)', ...pos }} />
  );
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {blob('rgba(168,52,74,0.28)', 380, { top: '-10%', left: '-8%' })}
      {blob('rgba(40,90,180,0.18)', 400, { bottom: '-14%', right: '-10%' })}
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
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>Spain run the midfield and the market’s underrating them by 7%. Real value on the win.</div>
      </div>
    </div>
  );
}

function Device() {
  const reduce = useReducedMotion();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', perspective: 1200 }}>
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
            position: 'relative', width: 'clamp(232px, 64vw, 300px)', aspectRatio: '9 / 18.5',
            borderRadius: 40, padding: 10,
            background: 'linear-gradient(160deg,#1c1e25,#0a0a0c)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 44px 120px rgba(168,52,74,0.28), 0 12px 44px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div aria-hidden style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 84, height: 20, borderRadius: 99, background: '#000', zIndex: 3 }} />
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 31, overflow: 'hidden', background: '#0B0B0D' }}>
            <PredictionCard />
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

      <style>{`
        .lp-hero { display:flex; flex-direction:column; align-items:center; gap:34px; width:100%; max-width:1120px; }
        .lp-text { text-align:center; }
        .lp-h1 { font-size:clamp(40px,12vw,82px); }
        .lp-sub { max-width:520px; margin:20px auto 0; font-size:clamp(15px,4vw,19px); }
        .lp-cta-row { margin-top:30px; }
        @media (min-width:920px) {
          .lp-hero { flex-direction:row; justify-content:space-between; align-items:center; gap:60px; }
          .lp-text { text-align:left; flex:1; }
          .lp-sub { margin:22px 0 0; font-size:20px; }
          .lp-h1 { font-size:clamp(56px,5.6vw,92px); }
          .lp-device { flex-shrink:0; }
        }
      `}</style>

      {/* ─── HERO: the unboxing ─────────────────────────────── */}
      <section ref={heroRef} style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 40px' }}>
        <div className="lp-hero">
          <motion.div className="lp-text" style={{ y: textY, opacity: textOpacity }}>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-muted)', border: '1px solid rgba(168,52,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>O</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700 }}><span style={{ color: 'var(--accent)' }}>Odd</span>yessa</span>
            </motion.div>
            <motion.h1
              className="lp-h1"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.05, ease }}
              style={{ fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, margin: 0, background: 'linear-gradient(180deg, #fff 30%, #b8889a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
            >
              Read the game.
            </motion.h1>
            <motion.p className="lp-sub" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease }} style={{ color: 'rgba(255,255,255,0.66)', lineHeight: 1.55 }}>
              Who’s going to win, and why — worked out for every match before kickoff. Plus the bets where the bookmakers have got it wrong.
            </motion.p>
            <motion.div className="lp-cta-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <Link to="/" onClick={enter} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 30px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 10px 34px rgba(168,52,74,0.42)' }}>
                Step inside <ArrowRight size={18} />
              </Link>
            </motion.div>
          </motion.div>

          <motion.div className="lp-device" style={{ y: deviceY, scale: deviceScale }}>
            <Device />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5, y: [0, 8, 0] }} transition={{ delay: 1.2, duration: 2, repeat: Infinity }} style={{ position: 'absolute', bottom: 18 }}>
          <ChevronDown size={24} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </motion.div>
      </section>

      {/* ─── PILLARS ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px,10vw,100px) 24px' }}>
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 12 }}>Football, with the homework done</motion.h2>
        <motion.p {...reveal} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto 48px', fontSize: 15, lineHeight: 1.6 }}>You bring the love of the game. We bring the numbers, the reasons, and a nose for value.</motion.p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,260px),1fr))', gap: 16 }}>
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: i * 0.1, ease }}
              style={{ padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
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
        <motion.h2 {...reveal} style={{ fontSize: 'clamp(26px,7vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 14 }}>Five taps, start to finish</motion.h2>
        <motion.p {...reveal} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', maxWidth: 460, margin: '0 auto 48px', fontSize: 15, lineHeight: 1.6 }}>Here’s exactly how you’ll use it.</motion.p>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 18 }}>No hiding</div>
          <div style={{ fontSize: 'clamp(56px, 18vw, 120px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>
            <BrierStat />
          </div>
          <h2 style={{ fontSize: 'clamp(22px,5.5vw,34px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '18px 0 16px' }}>We tell you how often we’re right.</h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.66)', lineHeight: 1.6 }}>
            Plenty of tipsters shout about their winners and quietly forget the losers. We don’t. Every call we make gets marked against what actually happened — and the score lives right here, in the open. Trust us exactly as much as we earn it.
          </p>
        </motion.div>
      </section>

      {/* ─── EMAIL CAPTURE ───────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: 'clamp(10px,4vw,40px) 24px clamp(40px,10vw,90px)' }}>
        <motion.div {...reveal} style={{ padding: 'clamp(22px,5vw,34px)', borderRadius: 24, background: 'rgba(168,52,74,0.10)', border: '1px solid rgba(168,52,74,0.25)' }}>
          <EmailCapture source="landing" />
        </motion.div>
      </section>

      {/* ─── CTA + RESPONSIBLE ───────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(40px,10vw,90px) 24px clamp(60px,14vw,120px)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <motion.div {...reveal}>
          <h2 style={{ fontSize: 'clamp(24px,6vw,38px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 26 }}>Come and read the game.</h2>
          <Link to="/" onClick={enter} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 10px 36px rgba(168,52,74,0.45)' }}>
            Step inside <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 36, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Oddyessa is for the love of the game and the numbers behind it — we don’t take bets. Everything here is information, not advice. 18+, and please play responsibly.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
