import React, { useMemo } from 'react';
import { CalendarX } from 'lucide-react';
import BrierScoreHero from './BrierScoreHero.jsx';
import { getVisibleTeamColor } from '../constants/teamColors.js';

// ─── CONFIDENCE CONFIG ───────────────────────────────────────────────────────
const CONFIDENCE = {
  HIGH:   { label: 'High',   color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.20)'   },
  MEDIUM: { label: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.20)'   },
  LOW:    { label: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
};

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
function InsightCard({ fixture, onSelect, featured }) {
  const prob = fixture.probability?.probabilities;
  const confidence = getConfidence(prob);
  const cfg = CONFIDENCE[confidence];
  const insights = getInsight(fixture);
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const homeColor = getVisibleTeamColor(fixture.homeTeam?.name);
  const awayColor = getVisibleTeamColor(fixture.awayTeam?.name);

  const kickoff = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onClick={() => onSelect?.(fixture)}
      style={{
        background: featured ? 'linear-gradient(135deg, rgba(168,52,74,0.12) 0%, #0B0B0D 58%)' : 'linear-gradient(155deg, #14161B 0%, #0B0B0D 65%)',
        border: `1px solid ${featured ? 'rgba(168,52,74,0.25)' : 'var(--border-subtle)'}`,
        borderRadius: 16,
        padding: '20px 24px',
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
            <span>H <strong style={{ color: homeColor }}>{prob.home}%</strong></span>
            <span>D <strong style={{ color: 'var(--text-secondary)' }}>{prob.draw}%</strong></span>
            <span>A <strong style={{ color: awayColor }}>{prob.away}%</strong></span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${prob.home}%`, background: homeColor, transition: 'width 600ms ease' }} />
            <div style={{ width: `${prob.draw}%`, background: 'rgba(255,255,255,0.12)', transition: 'width 600ms ease' }} />
            <div style={{ width: `${prob.away}%`, background: awayColor, transition: 'width 600ms ease' }} />
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
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '3px 10px', borderRadius: 99,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        }}>
          {cfg.label} Confidence
        </span>
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
          style={{ width: 32, height: 32, objectFit: 'contain' }}
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
export function AnalystDashboard({ fixtures = [], onSelect }) {
  // Prioritize: live → CL/EL → upcoming today → any scheduled
  const topMatches = useMemo(() => {
    const scored = (fixtures || [])
      .filter(f => f.homeTeam?.name && f.awayTeam?.name && f.date)
      .map(f => {
        let score = 0;
        if (f.status === 'IN_PLAY' || f.status === 'PAUSED') score += 100;
        if (f.league?.code === 'CL' || f.league?.code === 'EL') score += 50;
        if (f.status === 'SCHEDULED') score += 20;
        const prob = f.probability?.probabilities;
        if (prob) {
          const max = Math.max(prob.home ?? 0, prob.draw ?? 0, prob.away ?? 0);
          score += max; // higher confidence = higher up
        }
        return { fixture: f, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 6).map(s => s.fixture);
  }, [fixtures]);

  const liveCount = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length,
    [fixtures]
  );

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div style={{ padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>

      {/* ── BRIER SCORE HERO (the moat, made visible) ────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <BrierScoreHero />
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-in" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
              Top Match Insights
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              {today} · AI-powered predictions for today's key fixtures
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
      {topMatches.length > 0 ? (
        <div className="animate-fade-in" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
          gap: 16,
        }}>
          {topMatches.map((fixture, i) => (
            <InsightCard
              key={fixture.id}
              fixture={fixture}
              onSelect={onSelect}
              featured={i === 0}
            />
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
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No fixtures available</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Make sure the backend is running and the API keys are configured.
          </div>
        </div>
      )}

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
