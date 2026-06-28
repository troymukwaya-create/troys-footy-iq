import React from 'react';
import { T, num, label, VersusHero, ProbViz, RiskPill, VerdictPill, FlagBleedBg } from './fixture/primitives.jsx';
import { getMatchColor } from '../constants/nationColors.js';
import { fixtureView } from './fixture/oddData.js';
import { scorelineSummary } from '../lib/scoreline.js';
import OrbitMark from './OrbitMark.jsx';

/**
 * FixtureCard — the Oddyessa "Ticket" fixture card.
 *
 * The new brand identity (from the Claude Design "Fixture Cards" exploration):
 * a matchday ticket — oxblood spine + perforated fold, a diagonal flag-seam
 * crest with the scoreline (or VS) riding the fold, then a calm split-bar
 * probability read. Built on the shared VersusHero motif so every fixture
 * surface speaks the same matchup language.
 *
 * Approved tweak settings: split-bar probability · max density · nation
 * colours · accent #C0392B · flag-bleed on.
 */
const TWEAKS = { probViz: 'split', density: 5, colorMode: 'nation', accent: T.accent, flagBg: true };

// Scoreline honesty (unchanged principle): only HEADLINE a specific score when
// there's a clear favourite — otherwise the game is OPEN and we show the spread
// of likely scores, so even matchups never assert a copy-paste 1-1.
function ScorelineCall({ prob }) {
  const { confident, score, spread } = scorelineSummary(prob);
  if (confident) {
    return (
      <span style={{ ...num(10.5, 700), color: T.accent, padding: '2px 8px', borderRadius: 6, background: T.accentSoft, border: '1px solid ' + T.accentLine, whiteSpace: 'nowrap' }}>
        {score} <span style={{ ...label(7.5), color: T.t3 }}>likely</span>
      </span>
    );
  }
  if (!spread.length) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ ...label(7.5), color: T.t4 }}>OPEN</span>
      <span style={{ display: 'flex', gap: 4 }}>
        {spread.slice(0, 2).map((s, i) => (
          <span key={i} style={{ ...num(10, 600), color: T.t2, padding: '2px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.b1 }}>{s.score}</span>
        ))}
      </span>
    </span>
  );
}

function Ticket({ v, t, isSelected, fixtureProb }) {
  const accent = t.accent;
  const stubText = v.state === 'settled' ? 'FULL · TIME'
    : v.state === 'live' ? (v.minute ? `${v.minute}'  LIVE` : 'LIVE')
    : (v.kickoff ? `${v.kickoff} KO` : 'KICKOFF');
  // The notch "punches" through to the colour sitting behind the card (the
  // sidebar / panel surface), selling the ticket illusion.
  const notch = 'var(--bg-surface)';

  return (
    <div style={{
      position: 'relative', width: '100%', display: 'flex',
      background: T.raised,
      border: '1px solid ' + (isSelected ? accent : T.b2),
      borderRadius: 12, overflow: 'hidden', isolation: 'isolate',
      boxShadow: isSelected ? `0 0 0 1px ${accent}` : 'none',
    }}>
      <FlagBleedBg home={v.home} away={v.away} on={t.flagBg} opacity={0.18} />

      {/* Oxblood spine */}
      <div style={{ position: 'relative', width: 44, flexShrink: 0, background: `linear-gradient(180deg, ${accent}, ${T.accentDeep})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', zIndex: 4 }}>
        <OrbitMark size={16} ring="rgba(255,255,255,0.92)" dot="#ffffff" />
        <span style={{ ...num(11, 600), color: '#fff', transform: 'rotate(180deg)', writingMode: 'vertical-rl', letterSpacing: '0.14em' }}>{stubText}</span>
        <span style={{ width: 14, height: 14 }} />
      </div>

      {/* Perforated fold */}
      <div style={{ position: 'absolute', top: -7, left: 44, width: 14, height: 14, borderRadius: '50%', background: notch, transform: 'translateX(-50%)', zIndex: 5 }} />
      <div style={{ position: 'absolute', bottom: -7, left: 44, width: 14, height: 14, borderRadius: '50%', background: notch, transform: 'translateX(-50%)', zIndex: 5 }} />
      <div style={{ position: 'absolute', top: 6, bottom: 6, left: 44, borderLeft: '1.5px dashed rgba(255,255,255,0.25)', zIndex: 5 }} />

      {/* Body */}
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <VersusHero v={v} t={t} h={84} seam={[60, 40]} disc={16} codes codeSize={14} discTop={50} />
        <div style={{ padding: '10px 14px 13px 16px' }}>
          <div style={{ ...label(8.5), color: T.t3, marginBottom: v.prob ? 10 : 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {v.league}{v.stage ? ` · ${v.stage}` : ''}
          </div>

          {v.prob && (
            <ProbViz
              prob={v.prob} mode={t.probViz} colorMode={t.colorMode}
              homeColor={getMatchColor(v.home)} awayColor={getMatchColor(v.away)}
              density={t.density} score={v.score} state={v.state} accent={accent}
            />
          )}

          <div style={{ marginTop: v.prob ? 11 : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {v.state === 'settled' && v.score && v.prob
              ? <VerdictPill prob={v.prob} score={v.score} small />
              : v.prob
                ? <RiskPill level={v.risk} small />
                : <span style={{ ...label(8.5), color: T.t3 }}>{v.state === 'settled' ? 'Full time' : v.kickoff}</span>}

            {v.state !== 'settled' && fixtureProb && <ScorelineCall prob={fixtureProb} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FixtureCard({ fixture, isSelected, onClick, onMouseEnter }) {
  if (!fixture) return null;

  // ─── FRONTEND SAFETY CHECK ──────────────────────────────────────────
  // NEVER render a fixture with missing or invalid critical fields — this
  // keeps bad data from ever surfacing in the UI.
  const homeName = fixture.homeTeam?.name;
  const awayName = fixture.awayTeam?.name;
  const hasValidDate = fixture.date && !isNaN(new Date(fixture.date).getTime());
  const INVALID_NAMES = new Set(['undefined', 'null', 'tbd', '']);

  if (!homeName || !awayName ||
      INVALID_NAMES.has(String(homeName).toLowerCase()) ||
      INVALID_NAMES.has(String(awayName).toLowerCase()) ||
      !hasValidDate) {
    console.warn('[FixtureCard] ⚠️ Blocked render of invalid fixture:', fixture.id, { homeName, awayName, date: fixture.date });
    return (
      <div style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'transparent' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data unavailable</span>
      </div>
    );
  }
  // ────────────────────────────────────────────────────────────────────

  const v = fixtureView(fixture);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`match-card ${isSelected ? 'active' : ''}`}
      style={{ marginBottom: 6, borderRadius: 12, cursor: 'pointer' }}
    >
      <Ticket v={v} t={TWEAKS} isSelected={isSelected} fixtureProb={fixture.probability} />
    </div>
  );
}

export default FixtureCard;
