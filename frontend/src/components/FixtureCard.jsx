import React from 'react';
import { flagGradient } from '../constants/nationColors.js';
import FlagBleed, { hasFlags } from './FlagBleed.jsx';
import TeamMark from './TeamMark.jsx';

/**
 * FixtureCard — Compact sidebar match card.
 * Clean hierarchy: league → teams/score → probability strip.
 */
export function FixtureCard({ fixture, isSelected, onClick, onMouseEnter }) {
  if (!fixture) return null;

  // ─── FRONTEND SAFETY CHECK ──────────────────────────────────────────
  // NEVER render a fixture with missing or invalid critical fields.
  // This prevents incorrect data from ever appearing in the UI.
  const homeName = fixture.homeTeam?.name;
  const awayName = fixture.awayTeam?.name;
  const hasValidDate = fixture.date && !isNaN(new Date(fixture.date).getTime());
  const INVALID_NAMES = new Set(['undefined', 'null', 'tbd', '', undefined, null]);

  if (INVALID_NAMES.has(homeName?.toLowerCase?.()) || 
      INVALID_NAMES.has(awayName?.toLowerCase?.()) || 
      !hasValidDate) {
    console.warn('[FixtureCard] ⚠️ Blocked render of invalid fixture:', fixture.id, { homeName, awayName, date: fixture.date });
    return (
      <div style={{
        padding: '10px 12px', marginBottom: 4,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data unavailable</span>
      </div>
    );
  }
  // ────────────────────────────────────────────────────────────────────

  const home = homeName;
  const away = awayName;
  const homeCrest = fixture.homeTeam?.crest || null;
  const awayCrest = fixture.awayTeam?.crest || null;
  const status = fixture.status || 'SCHEDULED';
  const isLive = status === 'IN_PLAY' || status === 'PAUSED';
  const isFinished = status === 'FINISHED';
  const scoreHome = fixture.score?.home;
  const scoreAway = fixture.score?.away;
  const minute = fixture.minute;
  const prob = fixture.probability;

  const time = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // EXPERIMENT: real flags bleeding across the row (subtle, sidebar dose).
  const useFlagBleed = !isSelected && hasFlags(home, away);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`match-card ${isSelected ? 'active' : ''}`}
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isSelected ? 'rgba(168,52,74,0.30)' : 'var(--border-subtle)'}`,
        padding: '10px 12px',
        marginBottom: 4,
        background: isSelected ? 'var(--accent-muted)'
          : useFlagBleed ? '#101114'
          : flagGradient(home, away, null, '30'),
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {useFlagBleed && <FlagBleed home={home} away={away} opacity={0.45} />}
      {/* League + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fixture.league?.name || ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isLive && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
              {minute ? `${minute}'` : 'LIVE'}
            </span>
          )}
          {isFinished && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>FT</span>}
          {!isLive && !isFinished && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{time}</span>}
        </div>
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TeamRow name={home} crest={homeCrest} score={scoreHome} isWinner={isFinished && scoreHome > scoreAway} isLive={isLive} />
        <TeamRow name={away} crest={awayCrest} score={scoreAway} isWinner={isFinished && scoreAway > scoreHome} isLive={isLive} />
      </div>

      {/* Probability Strip */}
      {prob?.probabilities ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          {/* Probability values */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <ProbValue label="H" value={prob.probabilities.home} />
            <ProbValue label="D" value={prob.probabilities.draw} />
            <ProbValue label="A" value={prob.probabilities.away} />
          </div>

          {/* Risk + Scorelines */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <RiskBadge level={prob.riskLevel} />
            <div style={{ display: 'flex', gap: 4 }}>
              {prob.topScorelines?.slice(0, 2).map((sl, i) => (
                <span key={i} style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)', background: 'var(--bg-raised)',
                  border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>{sl.score}</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {/* No probability → no strip. A skeleton here pulsed FOREVER on live/
          finished matches whose endpoint never sends a prediction — a loading
          state must only promise data that is actually on its way. */}
    </div>
  );
}

function TeamRow({ name, crest, score, isWinner, isLive }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <TeamMark name={name} crest={crest} size={16} />
        <span style={{
          fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: isWinner ? 600 : 400,
          color: isWinner ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}>{name}</span>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, width: 20, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: isLive ? 'var(--success)' : isWinner ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>{score ?? ''}</span>
    </div>
  );
}

function ProbValue({ label, value }) {
  // Whole integers on tiles; decimals live on the analysis page.
  return (
    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
      {label} <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value == null ? '–' : Math.round(value)}%</span>
    </span>
  );
}

function RiskBadge({ level }) {
  const color = level === 'LOW' ? 'var(--success)' : level === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)';
  const bg = level === 'LOW' ? 'var(--success-muted)' : level === 'MEDIUM' ? 'var(--warning-muted)' : 'var(--danger-muted)';
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, color,
      padding: '2px 8px', borderRadius: 10,
      background: bg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {level ?? 'UNKNOWN'}
    </span>
  );
}
