import React, { useMemo } from 'react';
import { CalendarX } from 'lucide-react';
import BrierScoreHero from './BrierScoreHero.jsx';
import { getVisibleTeamColor } from '../constants/teamColors.js';
import { flagGradient, getMatchColor } from '../constants/nationColors.js';
import { motion } from 'motion/react';

// ─── CONFIDENCE CONFIG ───────────────────────────────────────────────────────
const CONFIDENCE = {
  HIGH:   { label: 'High',   color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.20)'   },
  MEDIUM: { label: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.20)'   },
  LOW:    { label: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
};

// Animated count-up for probability percentages.
function CountUp({ value, duration = 750 }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let raf; const start = performance.now(); const to = Number(value) || 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setN(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else setN(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toFixed(1)}%</>;
}

function getConfidence(prob) {
  if (!prob) return 'LOW';
  const max = Math.max(prob.home ?? 0, prob.draw ?? 0, prob.away ?? 0);
  if (max >= 55) return 'HIGH';
  if (max >= 42) return 'MEDIUM';
  return 'LOW';
}

function getInsight(fixture) {
  const prob = fixture.probability?.probabilities;
  if (!prob) return null;
  const { home, draw, away } = prob;
  const homeName = fixture.homeTeam?.name || 'Home';
  const awayName = fixture.awayTeam?.name || 'Away';

  const insights = [];

  if (home >= 55)  insights.push(`${homeName} are strong favourites at ${home}%`);
  else if (away >= 55) insights.push(`${awayName} are strong favourites at ${away}%`);
  else if (draw >= 30) insights.push(`A draw is likely — ${draw}% probability`);
  else insights.push(`Closely contested — ${homeName} ${home}% vs ${awayName} ${away}%`);

  const xG = fixture.probability?.expectedGoals;
  if (xG?.total >= 2.5) insights.push(`High-scoring expected: ${xG.total.toFixed(1)} total goals`);
  else if (xG?.total < 2.0 && xG?.total > 0) insights.push(`Low-scoring game expected: ${xG.total.toFixed(1)} goals`);

  return insights.slice(0, 2);
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

  const kickoff = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onClick={() => onSelect?.(fixture)}
      style={{
        background: flagGradient(fixture.homeTeam?.name, fixture.awayTeam?.name, featured ? 'linear-gradient(135deg, rgba(168,52,74,0.10) 0%, #0B0B0D 60%)' : 'linear-gradient(155deg, #14161B 0%, #0B0B0D 65%)'),
        border: `1px solid ${featured ? 'rgba(168,52,74,0.25)' : 'var(--border-subtle)'}`,
        borderRadius: 16,
        padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 24px)',
        cursor: 'pointer',
        transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = featured ? 'rgba(168,52,74,0.45)' : 'var(--border-default)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = featured ? 'rgba(168,52,74,0.25)' : 'var(--border-subtle)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
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

      {/* Probability Bar */}
      {prob && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            <span>H <strong style={{ color: homeColor }}><CountUp value={prob.home} /></strong></span>
            <span>D <strong style={{ color: 'var(--text-secondary)' }}><CountUp value={prob.draw} /></strong></span>
            <span>A <strong style={{ color: awayColor }}><CountUp value={prob.away} /></strong></span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${prob.home}%`, background: homeBar, transition: 'width 700ms ease' }} />
            <div style={{ width: `${prob.draw}%`, background: 'rgba(255,255,255,0.14)', transition: 'width 700ms ease' }} />
            <div style={{ width: `${prob.away}%`, background: awayBar, transition: 'width 700ms ease' }} />
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            padding: '3px 10px', borderRadius: 99,
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
          }}>
            {cfg.label} Confidence
          </span>
          {bestEdge >= 3 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.22)' }}>
              +{Math.round(bestEdge)}% value
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onSelect?.(fixture); }}
          style={{
            fontSize: 12, fontWeight: 600, padding: '6px 14px',
            borderRadius: 8, cursor: 'pointer', border: 'none',
            background: featured ? 'var(--accent)' : 'var(--accent-muted)',
            color: featured ? '#fff' : 'var(--accent)',
            transition: 'background 180ms ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.background = featured ? 'var(--accent)' : 'var(--accent-muted)'}
        >
          View Match →
        </button>
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
      {team?.crest && (
        <img
          src={team.crest} alt=""
          style={{ width: 40, height: 40, objectFit: 'contain' }}
          onError={e => e.target.style.display = 'none'}
        />
      )}
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
  // Prioritize: live → CL/EL → upcoming today → any scheduled
  const topMatches = useMemo(() => {
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

    return scored.slice(0, 5).map(s => s.fixture);
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
    WC: 'World Cup 2026', PL: 'Premier League', PD: 'La Liga', BL1: 'Bundesliga',
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
          <div style={{ fontSize: 'clamp(20px, 6vw, 27px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            AI predicts every match.
          </div>
          <div style={{ fontSize: 'clamp(13px, 3.6vw, 15px)', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Who'll win, <strong style={{ color: 'var(--text-primary)' }}>why</strong>, and where the bookies are wrong — and we <strong style={{ color: 'var(--accent)' }}>publish how often we're right</strong>.
          </div>
        </motion.div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-in" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
              {browse ? browseTitle : "Today's Best Bets"}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              {browse
                ? `${matches.length} ${matches.length === 1 ? 'fixture' : 'fixtures'} · our AI prediction on every match`
                : `${today} · The 5 matches our AI rates highest — confidence + value vs the bookies`}
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
