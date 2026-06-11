import React, { useMemo } from 'react';
import { CalendarX } from 'lucide-react';
import BrierScoreHero from './BrierScoreHero.jsx';
import { EmailCapture } from './EmailCapture.jsx';
import { getVisibleTeamColor } from '../constants/teamColors.js';
import { flagGradient, getMatchColor } from '../constants/nationColors.js';
import FlagBleed, { hasFlags } from './FlagBleed.jsx';
import { motion, useReducedMotion } from 'motion/react';
import TeamMark from './TeamMark.jsx';

// ─── CONFIDENCE CONFIG ───────────────────────────────────────────────────────
const CONFIDENCE = {
  HIGH:   { label: 'High',   color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.20)'   },
  MEDIUM: { label: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.20)'   },
  LOW:    { label: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
};

// (Count-up animation removed from card percentages on purpose: numbers
// hold still so they read as facts; motion lives on surfaces — hover
// sheen, flag bleeds, bar fills. Restraint on data reads premium.)

function getConfidence(prob) {
  if (!prob) return 'LOW';
  const max = Math.max(prob.home ?? 0, prob.draw ?? 0, prob.away ?? 0);
  if (max >= 55) return 'HIGH';
  if (max >= 42) return 'MEDIUM';
  return 'LOW';
}

// One or two SPECIFIC observations per card — drawn from what the model
// actually knows (market disagreement, match shape, likeliest score).
// The old version produced the same two sentence templates on every card,
// which read machine-generated when stacked on a page.
function getInsight(fixture) {
  const prob = fixture.probability?.probabilities;
  if (!prob) return null;
  const { home, draw, away } = prob;
  const homeName = fixture.homeTeam?.name || 'Home';
  const awayName = fixture.awayTeam?.name || 'Away';
  const lines = [];

  // The market disagreement is the most interesting fact we own.
  const ve = fixture.probability?.valueEdges;
  if (ve) {
    const options = [
      { edge: ve.home ?? -99, label: homeName },
      { edge: ve.draw ?? -99, label: 'the draw' },
      { edge: ve.away ?? -99, label: awayName },
    ].sort((a, b) => b.edge - a.edge);
    if (options[0].edge >= 5) {
      lines.push(`Bookies underrate ${options[0].label} by ${Math.round(options[0].edge)} points — our biggest disagreement here`);
    }
  }

  // Shape of the match — each profile gets its own voice.
  const max = Math.max(home, draw, away);
  if (home >= 70) lines.push(`${homeName} should win this — anything else is a ${Math.round(draw + away)}% shock`);
  else if (away >= 70) lines.push(`${awayName} to win, and it isn't close`);
  else if (draw >= 30) lines.push(`Unusually draw-heavy — ${Math.round(draw)}% against a ~25% baseline`);
  else if (max < 45) lines.push('A genuine three-way coin flip — nothing separates these sides');
  else if (home > away) lines.push(`${homeName} edge it, but this is no formality`);
  else lines.push(`${awayName} favoured away from home — rarer than it sounds`);

  // The likeliest scoreline is concrete and different on every card.
  const top = fixture.probability?.topScorelines?.[0];
  if (top?.score && lines.length < 2) lines.push(`Most likely score: ${top.score}`);

  return lines.slice(0, 2);
}

// ─── INSIGHT CARD ────────────────────────────────────────────────────────────
function InsightCard({ fixture, onSelect, featured, index }) {
  const prob = fixture.probability?.probabilities;
  const confidence = getConfidence(prob);
  const cfg = CONFIDENCE[confidence];
  const insights = getInsight(fixture);
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const homeColor = getVisibleTeamColor(fixture.homeTeam?.name);
  const awayColor = getVisibleTeamColor(fixture.awayTeam?.name);
  const homeBar = getMatchColor(fixture.homeTeam?.name);
  const awayBar = getMatchColor(fixture.awayTeam?.name);
  const ve = fixture.probability?.valueEdges;
  const bestEdge = ve ? Math.max(ve.home ?? 0, ve.draw ?? 0, ve.away ?? 0) : 0;
  const [hovered, setHovered] = React.useState(false);
  const reducedMotion = useReducedMotion();

  const kickoff = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // Real flags bleeding into each other; colour-gradient fallback when a
  // flag is unknown. On hover the flags breathe up — the world around the
  // numbers moves, the numbers themselves hold still.
  const useFlagBleed = hasFlags(fixture.homeTeam?.name, fixture.awayTeam?.name);
  const bleedOpacity = featured
    ? (hovered ? 0.85 : 0.75)
    : (hovered ? 0.78 : 0.65);

  return (
    <div
      onClick={() => onSelect?.(fixture)}
      onMouseMove={e => {
        if (reducedMotion) return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      style={{
        background: useFlagBleed
          ? (featured ? 'linear-gradient(135deg, rgba(168,52,74,0.10) 0%, #0B0B0D 60%)' : 'linear-gradient(155deg, #14161B 0%, #0B0B0D 65%)')
          : flagGradient(fixture.homeTeam?.name, fixture.awayTeam?.name, featured ? 'linear-gradient(135deg, rgba(168,52,74,0.10) 0%, #0B0B0D 60%)' : 'linear-gradient(155deg, #14161B 0%, #0B0B0D 65%)'),
        border: `1px solid ${featured ? 'rgba(168,52,74,0.25)' : 'var(--border-subtle)'}`,
        borderRadius: 16,
        padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 24px)',
        cursor: 'pointer',
        transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
      onMouseEnter={e => {
        setHovered(true);
        e.currentTarget.style.borderColor = featured ? 'rgba(168,52,74,0.45)' : 'var(--border-default)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={e => {
        setHovered(false);
        e.currentTarget.style.borderColor = featured ? 'rgba(168,52,74,0.25)' : 'var(--border-subtle)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {useFlagBleed && (
        <FlagBleed
          home={fixture.homeTeam?.name}
          away={fixture.awayTeam?.name}
          opacity={bleedOpacity}
        />
      )}
      {/* Cursor sheen — a soft light that follows the pointer across the
          card. Sits with the flags (below content), fades in on hover. */}
      {!reducedMotion && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none',
          background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.07), transparent 70%)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 300ms ease',
        }} />
      )}
      {/* Top Row: Competition + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {fixture.league?.name || 'Match'}
          {fixture.round ? ` · ${fixture.round}` : ''}
        </span>
        {isLive ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#22c55e' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
            {fixture.minute ? `${fixture.minute}'` : 'LIVE'}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kickoff}</span>
        )}
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <TeamBlock team={fixture.homeTeam} align="left" />
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)',
          padding: '6px 12px', background: 'var(--bg-raised)',
          border: '1px solid var(--border-default)', borderRadius: 8,
          letterSpacing: '0.05em', flexShrink: 0,
        }}>
          {isLive
            ? `${fixture.score?.home ?? 0} – ${fixture.score?.away ?? 0}`
            : 'VS'}
        </div>
        <TeamBlock team={fixture.awayTeam} align="right" />
      </div>

      {/* Probability Bar — whole integers (decimals live on the analysis
          page where the calibration story belongs); the FILL animates in
          on scroll, the numbers hold still. */}
      {prob && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            <span>H <strong style={{ color: homeColor }}>{Math.round(prob.home)}%</strong></span>
            <span>D <strong style={{ color: 'var(--text-secondary)' }}>{Math.round(prob.draw)}%</strong></span>
            <span>A <strong style={{ color: awayColor }}>{Math.round(prob.away)}%</strong></span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} whileInView={{ width: `${prob.home}%` }} viewport={{ once: true }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ background: homeBar }} />
            <motion.div initial={{ width: 0 }} whileInView={{ width: `${prob.draw}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }} style={{ background: 'rgba(255,255,255,0.14)' }} />
            <motion.div initial={{ width: 0 }} whileInView={{ width: `${prob.away}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.16, ease: [0.16, 1, 0.3, 1] }} style={{ background: awayBar }} />
          </div>
        </div>
      )}

      {/* Insights */}
      {insights?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {insights.map((text, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: 'var(--accent)', fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>›</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer: Confidence + CTA */}
      {/* Footer — chips appear only when they MEAN something: confidence
          only when genuinely high, value only at 5+ points. When every
          card wears a badge, no card does. The whole card is the link
          (no redundant button); a quiet chevron signals tappability. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border-subtle)', minHeight: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {confidence === 'HIGH' && (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                padding: '3px 10px', borderRadius: 99,
                background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
              }}>
                High confidence
              </span>
            )}
            {bestEdge >= 5 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.22)' }}>
                +{Math.round(bestEdge)} pts vs market
              </span>
            )}
          </div>
          <span aria-hidden style={{
            fontSize: 16, color: hovered ? 'var(--accent)' : 'var(--text-muted)',
            transform: hovered ? 'translateX(3px)' : 'translateX(0)',
            transition: 'transform 200ms ease, color 200ms ease',
          }}>›</span>
        </div>
    </div>
  );
}

function TeamBlock({ team, align }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: align === 'right' ? 'flex-end' : 'flex-start',
      gap: 6, flex: 1, minWidth: 0,
    }}>
      <TeamMark name={team?.name} crest={team?.crest} size={40} />
      <span style={{
        fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: '100%', textAlign: align,
      }}>
        {team?.name || '—'}
      </span>
    </div>
  );
}

// ─── HOMEPAGE ────────────────────────────────────────────────────────────────
export function AnalystDashboard({ fixtures = [], onSelect, activeLeague = 'ALL' }) {
  // "Today's Best Bets" means TODAY: the section is scoped to matches
  // kicking off today (viewer's local date) — a June-14 fixture has no
  // business under a June-11 headline. If nothing plays today, we fall
  // back to the next matches and say so honestly in the subtitle.
  const { topMatches, isTodaySelection } = useMemo(() => {
    const isToday = (d) => {
      const x = new Date(d), n = new Date();
      return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate();
    };

    const scored = (fixtures || [])
      .filter(f => f.homeTeam?.name && f.awayTeam?.name && f.date && f.status !== 'FINISHED' && f.status !== 'FT')
      .map(f => {
        const prob = f.probability?.probabilities;
        const maxProb = prob ? Math.max(prob.home ?? 0, prob.draw ?? 0, prob.away ?? 0) : 0;
        const ve = f.probability?.valueEdges;
        const bestEdge = ve ? Math.max(ve.home ?? 0, ve.draw ?? 0, ve.away ?? 0) : 0;
        // Best bet = high confidence + positive value vs the bookmaker.
        let score = maxProb + Math.max(0, bestEdge) * 1.2;
        if (f.status === 'IN_PLAY' || f.status === 'PAUSED') score += 8; // small live nudge
        return { fixture: f, score };
      })
      .sort((a, b) => b.score - a.score);

    const todays = scored.filter(s => isToday(s.fixture.date) ||
      s.fixture.status === 'IN_PLAY' || s.fixture.status === 'PAUSED');

    if (todays.length > 0) {
      return { topMatches: todays.slice(0, 5).map(s => s.fixture), isTodaySelection: true };
    }
    return { topMatches: scored.slice(0, 5).map(s => s.fixture), isTodaySelection: false };
  }, [fixtures]);

  const liveCount = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length,
    [fixtures]
  );

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  // When a competition/filter is picked (not the default Home), show ALL of its
  // fixtures in the centre — not just the curated top-5 best bets.
  const browse = !!activeLeague && activeLeague !== 'ALL';
  const LEAGUE_NAMES = {
    WC: 'World Cup 2026', FR: 'International Friendlies',
    PL: 'Premier League', PD: 'La Liga', BL1: 'Bundesliga',
    SA: 'Serie A', FL1: 'Ligue 1', CL: 'Champions League', EL: 'Europa League',
    BSA: 'Brasileirão', ERE: 'Eredivisie', PPL: 'Primeira Liga', ELC: 'Championship',
    LIVE: 'Live Now', TODAY: "Today's Matches", TOMORROW: "Tomorrow's Matches",
  };
  const browseTitle = LEAGUE_NAMES[activeLeague] || activeLeague;
  const browseMatches = useMemo(() => {
    if (!browse) return [];
    return (fixtures || [])
      .filter(f => f.homeTeam?.name && f.awayTeam?.name && f.date)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [fixtures, browse]);
  const matches = browse ? browseMatches : topMatches;

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px) clamp(12px, 4vw, 24px)', maxWidth: 960, margin: '0 auto' }}>
      {/* ── VALUE LINE — instant "what is this" clarity (Home only) ── */}
      {!browse && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginBottom: 24, padding: 'clamp(16px, 5vw, 22px)', borderRadius: 16, border: '1px solid var(--accent-muted)', background: 'linear-gradient(135deg, rgba(168,52,74,0.14), transparent 75%)' }}
        >
          <div className="font-display" style={{ fontSize: 'clamp(20px, 6vw, 27px)', fontWeight: 800, lineHeight: 1.15 }}>
            Football predictions that show their work.
          </div>
          <div style={{ fontSize: 'clamp(13px, 3.6vw, 15px)', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Win probabilities for every match, <strong style={{ color: 'var(--text-primary)' }}>value against the bookmakers</strong> — and a <strong style={{ color: 'var(--accent)' }}>public accuracy record</strong> updated after every final whistle.
          </div>
        </motion.div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-in" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
              {browse ? browseTitle : (isTodaySelection ? "Today's Best Bets" : 'Next Up — Best Bets')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              {browse
                ? `${matches.length} ${matches.length === 1 ? 'fixture' : 'fixtures'} · the model's call on every match`
                : isTodaySelection
                  ? `${today} · The ${matches.length === 1 ? 'match' : `${matches.length} matches`} the model rates highest from today's games`
                  : `No matches today · the model's top picks from upcoming fixtures`}
            </p>
          </div>
          {liveCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 99,
              background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{liveCount} Live Now</span>
            </div>
          )}
        </div>
      </div>

      {/* ── INSIGHT CARDS ────────────────────────────────────────────── */}
      {matches.length > 0 ? (
        <div className="animate-fade-in" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))',
          gap: 16,
        }}>
          {matches.map((fixture, i) => (
            <motion.div
              key={fixture.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(i * 0.05, 0.4) }}
              whileTap={{ scale: 0.985 }}
            >
              <InsightCard fixture={fixture} onSelect={onSelect} featured={!browse && i === 0} index={i} />
            </motion.div>
          ))}
        </div>
      ) : (
        /* ── EMPTY STATE ─────────────────────────────────────────── */
        <div className="animate-fade-in" style={{
          textAlign: 'center', padding: '80px 24px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16, background: 'var(--bg-surface)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <CalendarX size={36} color="var(--text-tertiary)" strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{browse ? `No ${browseTitle} fixtures right now` : 'No fixtures available'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {browse ? 'Check back closer to kickoff, or pick another competition.' : 'Make sure the backend is running and the API keys are configured.'}
          </div>
        </div>
      )}

      {/* ── TRACK RECORD (proof, below the matches) ──────────────────── */}
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Why trust these calls — our public track record
        </div>
        <BrierScoreHero />
      </div>

      {/* ── EMAIL CAPTURE (the WC asset is the list; the landing page
            was the only place asking — returning users never saw it) ── */}
      <div style={{ marginTop: 24, padding: 'clamp(16px, 4vw, 24px)', borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <EmailCapture source="dashboard" hideIfSubscribed />
      </div>

      {/* ── MORE FIXTURES HINT ────────────────────────────────────── */}
      {fixtures.length > 6 && (
        <p style={{
          textAlign: 'center', marginTop: 24,
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          {fixtures.length - 6} more fixtures available — browse via the sidebar
        </p>
      )}
    </div>
  );
}
