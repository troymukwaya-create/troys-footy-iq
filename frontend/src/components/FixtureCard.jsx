import React from 'react';
import { flagGradient } from '../constants/nationColors.js';
import FlagBleed, { hasFlags } from './FlagBleed.jsx';
import TeamMark from './TeamMark.jsx';
import { scorelineSummary } from '../lib/scoreline.js';

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
      {useFlagBleed && <FlagBleed home={home} away={away} opacity={0.6} />}
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

          {/* Risk (upcoming) or verdict (settled) + the scoreline call.
              Settled: the top scorelines with a ✓ on a hit. Upcoming: a
              specific score ONLY when there's a clear favourite — otherwise
              "Open" + the spread, so even games never assert a single 1-1. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            {isFinished && scoreHome != null && scoreAway != null
              ? <VerdictBadge prob={prob} scoreHome={scoreHome} scoreAway={scoreAway} />
              : <RiskBadge level={prob.riskLevel} />}
            {isFinished && scoreHome != null && scoreAway != null
              ? <FinishedScorelines sls={prob.topScorelines} scoreHome={scoreHome} scoreAway={scoreAway} />
              : <ScorelineCall prob={prob} />}
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

// Settled fixture: graded by the probability we gave the actual result, not
// a binary did-the-favourite-win. Mirrors backend/engine/grading.js (22/13).
// Both verdicts render — every ✓ on the feed is backed by visible misses.
const VERDICT_TIER = {
  ON_READ: { label: '✓ Called it', color: 'var(--success)', bg: 'var(--success-muted)' },
  IN_RANGE: { label: '≈ In range', color: '#AAB2C0', bg: 'rgba(138,148,166,0.14)' },
  AGAINST: { label: '± Against', color: '#D99A2B', bg: 'rgba(217,154,43,0.12)' },
  MISSED: { label: '✗ Missed', color: 'var(--danger)', bg: 'var(--danger-muted)' },
};
function VerdictBadge({ prob, scoreHome, scoreAway }) {
  // Number() so a stringified prob can't trigger lexicographic comparison
  // (would silently disagree with the ledger/receipt). Tie-break mirrors
  // backend/engine/grading.js + the sibling fallbacks exactly.
  const pr = prob?.probabilities || {};
  const home = Number(pr.home) || 0, draw = Number(pr.draw) || 0, away = Number(pr.away) || 0;
  const p = { HOME: home, DRAW: draw, AWAY: away };
  const norm = (v) => { const n = Number(v) || 0; return n > 1 ? n / 100 : n; };
  const predicted = home >= draw && home >= away ? 'HOME' : draw >= away ? 'DRAW' : 'AWAY';
  const actual = scoreHome > scoreAway ? 'HOME' : scoreHome < scoreAway ? 'AWAY' : 'DRAW';
  const pa = norm(p[actual] || 0);
  const tier = actual === predicted ? 'ON_READ' : pa >= 0.22 ? 'IN_RANGE' : pa >= 0.13 ? 'AGAINST' : 'MISSED';
  const t = VERDICT_TIER[tier];
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, color: t.color,
      padding: '2px 8px', borderRadius: 10,
      background: t.bg,
    }}>
      {t.label}
    </span>
  );
}

// Settled: the predicted scorelines, with a ✓ on the one that actually landed.
function FinishedScorelines({ sls, scoreHome, scoreAway }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(sls || []).slice(0, 2).map((sl, i) => {
        const hit = sl.score === `${scoreHome}-${scoreAway}`;
        return (
          <span key={i} style={{
            fontSize: 10, fontWeight: hit ? 700 : 600, padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            background: hit ? 'var(--success-muted)' : 'var(--bg-raised)',
            border: `1px solid ${hit ? 'var(--success)' : 'var(--border-subtle)'}`,
            color: hit ? 'var(--success)' : 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}>{sl.score}{hit ? ' ✓' : ''}</span>
        );
      })}
    </div>
  );
}

// Upcoming: name a score only when there's a clear favourite ("2-0 likely").
// Otherwise the game is OPEN — show the spread of most-likely scores so even
// matchups read as individually judged, never a copy-paste 1-1.
function ScorelineCall({ prob }) {
  const { confident, score, spread } = scorelineSummary(prob);
  if (confident) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        border: '1px solid rgba(168,52,74,0.30)', fontVariantNumeric: 'tabular-nums',
      }}>{score} likely</span>
    );
  }
  if (!spread.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>OPEN</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {spread.slice(0, 2).map((s, i) => (
          <span key={i} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
          }}>{s.score}</span>
        ))}
      </div>
    </div>
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
