import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

const ACCENT = '#A8344A';

// ─── The five marks (from the brand exploration) ─────────────────────
const OrbitO = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ color: '#fff' }}>
    <ellipse cx="32" cy="32" rx="26" ry="14" fill="none" stroke="currentColor" strokeWidth="3" transform="rotate(-35 32 32)" strokeLinecap="round" />
    <circle cx="32" cy="32" r="9" fill="currentColor" />
    <circle cx="50.5" cy="20.5" r="4" fill={ACCENT} />
  </svg>
);
const TheEdge = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ color: '#fff' }}>
    <path d="M10 42 L44 24 L54 24 L20 42 Z" fill="currentColor" />
    <path d="M10 32 L44 14 L54 14 L20 32 Z" fill="currentColor" />
    <path d="M44 24 L54 24 L54 14 L44 14 Z" fill={ACCENT} />
  </svg>
);
const NorthStar = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ color: '#fff' }}>
    <path d="M32 4 L37 27 L60 32 L37 37 L32 60 L27 37 L4 32 L27 27 Z" fill="currentColor" />
    <circle cx="32" cy="32" r="13" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="32" cy="32" r="4" fill={ACCENT} />
  </svg>
);
const PitchArc = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ color: '#fff' }}>
    <line x1="8" y1="48" x2="56" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M14 48 A22 22 0 0 1 50 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="30" r="4.5" fill={ACCENT} />
  </svg>
);
const MonogramO = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ color: '#fff' }}>
    <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M32 6 A26 26 0 1 1 32 58 A26 26 0 1 1 32 6 Z M32 17 A15 15 0 1 0 32 47 A15 15 0 1 0 32 17 Z" />
    <path fill={ACCENT} d="M48.5 45 A26 26 0 0 1 45 48.5 L37.5 41 A15 15 0 0 0 41 37.5 Z" />
  </svg>
);

const LOGOS = [
  { id: 1, name: 'Orbit-O', blurb: 'A ball circled by an orbit — the O, the match, and the odyssey in one glyph.', Mark: OrbitO },
  { id: 2, name: 'The Edge', blurb: 'Two odds lines just out of line; the bright wedge between them is the value you capture.', Mark: TheEdge },
  { id: 3, name: 'North-Star Read', blurb: 'A guiding star inside a ring — navigation + the letter O. The signal you follow.', Mark: NorthStar },
  { id: 4, name: 'Pitch Arc', blurb: 'The view behind the goal — box arc + spot — that doubles as a rising probability curve.', Mark: PitchArc },
  { id: 5, name: 'Monogram O', blurb: 'A clean, app-icon-ready O with a carved “value” notch. The most versatile.', Mark: MonogramO },
];

function Wordmark({ Mark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 26, height: 26 }}><Mark /></div>
      <span style={{ fontSize: 18, fontWeight: 700 }}><span style={{ color: ACCENT }}>Odd</span>yessa</span>
    </div>
  );
}

export default function LogoOptions() {
  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', background: '#070708', color: 'var(--text-primary)', padding: 'clamp(28px,7vw,64px) 24px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Link to="/how-it-works" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Back</Link>
          <h1 style={{ fontSize: 'clamp(28px,7vw,46px)', fontWeight: 900, letterSpacing: '-0.03em', marginTop: 16 }}>Pick your logo</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginTop: 10, maxWidth: 560, lineHeight: 1.6 }}>
            Five directions for the Oddyessa mark. Each works in one flat colour and scales down to a favicon. Tell me the number you like and I’ll wire it in everywhere.
          </p>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%,300px),1fr))', gap: 18, marginTop: 40 }}>
          {LOGOS.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              style={{ borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}
            >
              <div style={{ position: 'relative', height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(168,52,74,0.16), transparent 60%)' }}>
                <span style={{ position: 'absolute', top: 12, left: 14, fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.35)' }}>{l.id}</span>
                <div style={{ width: 80, height: 80 }}><l.Mark /></div>
              </div>
              <div style={{ padding: '16px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ marginBottom: 12 }}><Wordmark Mark={l.Mark} /></div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{l.id}. {l.name}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>{l.blurb}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 40, textAlign: 'center' }}>
          Like one? Just tell me <strong style={{ color: '#fff' }}>“use logo 5”</strong> and I’ll put it in the nav, the app icon and the favicon.
        </p>
      </div>
    </div>
  );
}
