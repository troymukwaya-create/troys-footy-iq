// ─── THE PAPER TRAIL ─────────────────────────────────────────────────
// The intro IS a receipt, printing out of a slot as you scroll. Built
// only from things that are ours: the Receipt, the terminal, the flag
// bleed, the orbit dot. No aurora blobs, no floating phones, no pillars.
//
// Beats: wordmark → manifesto → EXHIBIT A (a real upcoming call, live
// from the API, on a flag-bled tile) → the terms, printed as line items
// (misses in red) → "tomorrow's paper" email line item → perforation →
// TEAR HERE, which tears the stub off and drops you into the app.
//
// Reduced motion: the paper arrives fully printed, the tear is instant.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import FlagBleed from '../components/FlagBleed.jsx';
import { EmailCapture } from '../components/EmailCapture.jsx';
import { getMatchColor } from '../constants/nationColors.js';
import { flagUrl } from '../constants/nationFlags.js';

const RAW_BASE = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/+$/, '')}/api`;

const ease = [0.16, 1, 0.3, 1];
// Each block "prints" as it emerges — a short rise, nothing showy.
const print = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-30px' },
  transition: { duration: 0.35, ease },
};

const MONO = 'var(--font-mono, "IBM Plex Mono", monospace)';

// Static fallback when the API is cold — a real settled call, labelled.
const FALLBACK_MATCH = {
  home: 'Mexico', away: 'South Africa',
  kickoffLabel: 'OPENING NIGHT · SETTLED 2–0',
  probs: { home: 67.3, draw: 21.5, away: 11.2 },
  pick: 'Mexico', risk: 'LOW',
  scoreline: '2-0',
  settled: true,
};

function useExhibitA() {
  const [match, setMatch] = useState(null);
  useEffect(() => {
    let on = true;
    fetch(`${API_BASE}/fixtures/upcoming`)
      .then(r => r.json())
      .then(d => {
        if (!on) return;
        const f = (d?.fixtures || []).find(x =>
          x?.probability?.probabilities && x.league?.code === 'WC' && flagUrl(x.homeTeam?.name) && flagUrl(x.awayTeam?.name));
        if (!f) return;
        const p = f.probability;
        const { home, draw, away } = p.probabilities;
        setMatch({
          home: f.homeTeam.name, away: f.awayTeam.name,
          kickoffLabel: new Date(f.date).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase(),
          probs: { home, draw, away },
          pick: home >= draw && home >= away ? f.homeTeam.name : (away >= draw ? f.awayTeam.name : 'Draw'),
          risk: p.riskLevel || 'MEDIUM',
          scoreline: p.topScorelines?.[0]?.score || null,
          settled: false,
        });
      })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return match || FALLBACK_MATCH;
}

const RISK_PLAIN = { LOW: 'we’re confident', MEDIUM: 'we lean this way', HIGH: 'a coin flip — and we say so' };

// One real call on a flag-bled tile — the product, exhibited on the paper.
function ExhibitTile({ m }) {
  const h = Math.max(4, Math.round(m.probs.home));
  const a = Math.max(4, Math.round(m.probs.away));
  return (
    <div style={{ position: 'relative', isolation: 'isolate', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', padding: '16px 18px', background: '#101114' }}>
      <FlagBleed home={m.home} away={m.away} opacity={0.45} />
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>{m.kickoffLabel}</div>
      <div style={{ fontSize: 'clamp(16px,4.2vw,20px)', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>
        <span style={{ whiteSpace: 'nowrap' }}>
          <img src={flagUrl(m.home, 40)} alt="" width="20" height="14" style={{ display: 'inline', borderRadius: 2, verticalAlign: -1, marginRight: 7 }} />
          {m.home}
        </span>
        {' '}<span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>v</span>{' '}
        <span style={{ whiteSpace: 'nowrap' }}>
          {m.away}
          <img src={flagUrl(m.away, 40)} alt="" width="20" height="14" style={{ display: 'inline', borderRadius: 2, verticalAlign: -1, marginLeft: 7 }} />
        </span>
      </div>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', gap: 2, marginTop: 14 }}>
        <div style={{ width: `${h}%`, background: getMatchColor(m.home), borderRadius: '4px 0 0 4px' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.16)' }} />
        <div style={{ width: `${a}%`, background: getMatchColor(m.away), borderRadius: '0 4px 4px 0' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 7 }}>
        <span>{m.home} {Math.round(m.probs.home)}%</span>
        <span>draw {Math.round(m.probs.draw)}%</span>
        <span>{Math.round(m.probs.away)}%</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
        Our call: <b style={{ color: '#fff' }}>{m.pick}</b>
        <span style={{ color: m.risk === 'LOW' ? '#22C55E' : '#EAB308', fontSize: 12.5 }}> · {m.settled ? 'called before kickoff — and it landed' : RISK_PLAIN[m.risk]}</span>
        {m.scoreline && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}> · most likely {m.scoreline}</span>}
      </div>
    </div>
  );
}

function LineItem({ left, right, color }) {
  return (
    <motion.div {...print} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 0', fontFamily: MONO, fontSize: 'clamp(12px,3.4vw,15px)', letterSpacing: '0.04em' }}>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{left}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: '2px dotted rgba(255,255,255,0.14)', transform: 'translateY(-4px)' }} />
      <span style={{ color: color || 'rgba(255,255,255,0.92)', fontWeight: 600, textAlign: 'right' }}>{right}</span>
    </motion.div>
  );
}

const Dashed = () => <div style={{ borderTop: '1px dashed rgba(255,255,255,0.16)', margin: '30px 0' }} />;

export default function HowItWorks() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const exhibit = useExhibitA();
  const [tearing, setTearing] = useState(false);
  const stubRef = React.useRef(null);

  const enter = () => { try { localStorage.setItem('oddyessa_welcomed', '1'); } catch { /* ignore */ } };
  const tear = () => {
    enter();
    if (reduce || tearing) { navigate('/'); return; }
    setTearing(true);
    setTimeout(() => navigate('/'), 520);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0B0B0D', color: 'var(--text-primary)', overflowX: 'hidden' }}>
      {/* faint spotlight down the middle — the only light in the room */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(640px 380px at 50% -8%, rgba(168,52,74,0.12), transparent 65%)' }} />

      {/* the printer slot, fixed — the paper feeds through it as you scroll */}
      <div aria-hidden style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', width: 'min(700px, 96vw)', height: 22, zIndex: 10, background: '#050506', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 3px 9px rgba(0,0,0,0.9), 0 6px 18px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', left: 20, right: 20, top: 9, height: 4, borderRadius: 2, background: '#000' }} />
      </div>

      {/* ── THE PAPER ── */}
      <motion.div
        animate={tearing ? { y: -40, opacity: 0.92 } : {}}
        transition={{ duration: 0.5, ease }}
        style={{ position: 'relative', width: 'min(620px, 92vw)', margin: '24px auto 0', background: '#14161B', border: '1px solid rgba(255,255,255,0.10)', borderTop: 'none', boxShadow: '0 40px 110px rgba(0,0,0,0.6)', padding: 'clamp(34px,7vw,56px) clamp(22px,6vw,54px) 0' }}
      >
        {/* header zone gets the subtlest hint of the day's flags */}
        <div style={{ textAlign: 'center' }}>
          <motion.div {...print}>
            <svg width="58" height="58" viewBox="0 0 100 100" aria-label="Oddyessa" style={{ display: 'block', margin: '0 auto' }}>
              <path d="M 57.25 22.95 A 28 28 0 1 0 77.05 42.75" fill="none" stroke="#F7F4EE" strokeWidth="9" strokeLinecap="round" />
              <circle cx="69.8" cy="30.2" r="8" fill="#A8344A" />
            </svg>
            <div className="font-display" style={{ fontSize: 'clamp(30px,8vw,40px)', fontWeight: 800, marginTop: 8 }}>
              <span style={{ color: 'var(--accent)' }}>Odd</span>yessa
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.26em', color: 'rgba(255,255,255,0.38)', marginTop: 10 }}>
              FOOTBALL · READ THE GAME
            </div>
          </motion.div>

          <Dashed />

          <motion.h1 {...print} className="font-display" style={{ fontSize: 'clamp(28px,7vw,40px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.01em', margin: 0 }}>
            Football predictions<br />that <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>show their work.</span>
          </motion.h1>
          <motion.p {...print} style={{ fontSize: 'clamp(14px,3.8vw,17px)', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', maxWidth: 430, margin: '16px auto 0' }}>
            Before every match we work out who should win, the likely score,
            and why — and put it on the record before kickoff.
          </motion.p>
        </div>

        <Dashed />

        {/* EXHIBIT A — a real call */}
        <motion.div {...print} style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.38)', textAlign: 'center', marginBottom: 14 }}>
          EXHIBIT A · {exhibit.settled ? 'A CALL THAT LANDED' : 'A LIVE CALL, BEFORE KICKOFF'}
        </motion.div>
        <motion.div {...print}>
          <ExhibitTile m={exhibit} />
        </motion.div>
        <motion.p {...print} style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 12 }}>
          ↳ tap any match inside for the full reasoning
        </motion.p>

        <Dashed />

        {/* the terms, printed */}
        <LineItem left="EVERY MATCH" right="A CALL + THE WHY" />
        <LineItem left="EVERY CALL" right="LOCKED PRE-KICKOFF" />
        <LineItem left="EVERY RESULT" right="GRADED IN PUBLIC" />
        <LineItem left="OUR MISSES" right="PRINTED TOO" color="#EF4444" />

        <Dashed />

        {/* tomorrow's paper — the email is the same object as this page */}
        <motion.div {...print}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.38)', textAlign: 'center' }}>
            DAILY EDITION
          </div>
          <p style={{ fontSize: 'clamp(15px,4vw,17px)', fontWeight: 700, textAlign: 'center', margin: '10px 0 14px' }}>
            Get tomorrow’s paper in your inbox — every morning, before kickoff.
          </p>
          <EmailCapture source="paper_trail" compact onDone={() => stubRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })} />
        </motion.div>

        <div style={{ height: 34 }} />

        {/* printed fine print */}
        <motion.p {...print} style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingBottom: 26 }}>
          INFORMATION, NOT BETTING ADVICE · WE DON’T TAKE BETS · 18+ · PLEASE PLAY RESPONSIBLY
        </motion.p>

        {/* perforation */}
        <div aria-hidden style={{ position: 'relative', height: 16, margin: '0 -1px' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 8px 8px, #0B0B0D 7px, transparent 7.5px)', backgroundSize: '30px 16px', backgroundPosition: 'center' }} />
        </div>
      </motion.div>

      {/* ── THE STUB — tear it off to step inside ── */}
      <motion.button
        ref={stubRef}
        onClick={tear}
        animate={tearing ? { rotate: 7, y: 110, opacity: 0 } : {}}
        whileHover={reduce ? {} : { rotate: 0.8 }}
        transition={{ duration: 0.5, ease }}
        style={{
          display: 'block', width: 'min(620px, 92vw)', margin: '0 auto 70px', cursor: 'pointer',
          background: '#14161B', color: 'inherit', border: '1px solid rgba(255,255,255,0.10)', borderTop: 'none',
          boxShadow: '0 40px 110px rgba(0,0,0,0.6)', padding: 'clamp(20px,5vw,28px)',
          textAlign: 'center', transformOrigin: '20% 0%',
        }}
        aria-label="Tear the receipt and step inside Oddyessa"
      >
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.26em', color: 'rgba(255,255,255,0.45)', display: 'block' }}>
          ✂ TEAR HERE
        </span>
        <span className="font-display" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 'clamp(18px,5vw,24px)', fontWeight: 800, color: '#fff' }}>
          Step inside <ArrowRight size={20} style={{ color: 'var(--accent)' }} />
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
          free · no account needed
        </span>
      </motion.button>
    </div>
  );
}
