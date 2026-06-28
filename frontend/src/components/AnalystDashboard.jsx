import React, { useMemo } from 'react';
import { CalendarX } from 'lucide-react';
import BrierScoreHero from './BrierScoreHero.jsx';
import { LedgerBreakdown } from './LedgerBreakdown.jsx';
import TrackRecord from './TrackRecord.jsx';
import { EmailCapture } from './EmailCapture.jsx';
import { getMatchColor } from '../constants/nationColors.js';
import MatchdayBoard from './MatchdayBoard.jsx';
import { motion } from 'motion/react';
import { fixtureView } from './fixture/oddData.js';
import { VersusHero, T } from './fixture/primitives.jsx';
import ScrollReveal from './reactbits/ScrollReveal.jsx';
import GlassSurface from './reactbits/GlassSurface.jsx';
import DecryptedText from './reactbits/DecryptedText.jsx';

const MONO = 'var(--font-mono)';

// One or two SPECIFIC observations per card — drawn from what the model
// actually knows (market disagreement, match shape, likeliest score).
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

// ─── INSIGHT CARD (competition browse view) ──────────────────────────
// On the VersusHero seam motif — same brand identity as the home board and
// the sidebar Ticket cards (was the old full flag-bleed). Seam header (flags
// + codes + score/VS) → full names → probability → the model's read → edge.
function InsightCard({ fixture, onSelect }) {
  const prob = fixture.probability?.probabilities;
  const insights = getInsight(fixture);
  const homeBar = getMatchColor(fixture.homeTeam?.name);
  const awayBar = getMatchColor(fixture.awayTeam?.name);
  const ve = fixture.probability?.valueEdges;
  const bestEdge = ve ? Math.max(ve.home ?? 0, ve.draw ?? 0, ve.away ?? 0) : 0;
  const [hovered, setHovered] = React.useState(false);
  const v = fixtureView(fixture);

  return (
    <div
      onClick={() => onSelect?.(fixture)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.raised,
        border: '1px solid ' + (hovered ? 'var(--border-strong)' : 'var(--border-default)'),
        borderRadius: 14, cursor: 'pointer', transition: 'border-color 180ms ease',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden', isolation: 'isolate',
      }}
    >
      {v && (
        <VersusHero v={v} t={{ accent: T.accent, colorMode: 'nation', density: 5 }}
          h={120} seam={[58, 42]} disc={23} meta codes codeSize={20} discTop={50} />
      )}

      <div style={{ padding: 'clamp(13px,3.5vw,16px) clamp(14px,4vw,18px)', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* full team names — clarity for the browse grid */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.homeTeam?.name}</span>
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontSize: '0.8em', flexShrink: 0 }}>v</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.awayTeam?.name}</span>
        </div>

        {/* Probability bar — mono numbers, team-coloured fills */}
        {prob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              <span>H <strong style={{ color: 'var(--text-primary)' }}>{Math.round(prob.home)}%</strong></span>
              <span>D <strong style={{ color: 'var(--text-primary)' }}>{Math.round(prob.draw)}%</strong></span>
              <span>A <strong style={{ color: 'var(--text-primary)' }}>{Math.round(prob.away)}%</strong></span>
            </div>
            <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
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

        {/* Footer — at most ONE label (the market disagreement). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', minHeight: 24 }}>
          <div>
            {bestEdge >= 5 && (
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, padding: '2.5px 8px', borderRadius: 3, color: 'var(--success)', border: '1px solid rgba(34,197,94,0.35)', letterSpacing: '0.04em' }}>
                +{Math.round(bestEdge)} PTS VS MARKET
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
    </div>
  );
}

// ─── HOMEPAGE ────────────────────────────────────────────────────────
// Council-verdict order (2026-06-13): the live matchday board IS the
// homepage. Board → email capture (one thumb-scroll on mobile) →
// receipts (the proof) → browse hint. The brochure hero is gone.
export function AnalystDashboard({ fixtures = [], onSelect, activeLeague = 'ALL' }) {
  // When a competition/filter is picked (not the default Home), show ALL of
  // its fixtures as cards — the board stays a Home-only object.
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

  if (browse) {
    return (
      <div style={{ padding: 'clamp(16px, 4vw, 32px) clamp(12px, 4vw, 24px)', maxWidth: 960, margin: '0 auto' }}>
        <div className="animate-fade-in" style={{ marginBottom: 24 }}>
          <h1 className="font-display" style={{ fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
            {browseTitle}
          </h1>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0 }}>
            {browseMatches.length} {browseMatches.length === 1 ? 'fixture' : 'fixtures'} · the model's call on every match
          </p>
        </div>
        {browseMatches.length > 0 ? (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 14 }}>
            {browseMatches.map((fixture) => (
              <InsightCard key={fixture.id} fixture={fixture} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <EmptyState title={`No ${browseTitle} fixtures right now`} sub="Check back closer to kickoff, or pick another competition." />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(14px, 3.5vw, 28px) clamp(12px, 4vw, 24px)', maxWidth: 960, margin: '0 auto' }}>
      {/* ── THE BOARD — screen zero ─────────────────────────────────── */}
      {fixtures.length > 0 ? (
        <MatchdayBoard fixtures={fixtures} onSelect={onSelect} />
      ) : (
        <EmptyState title="No fixtures available" sub="Make sure the backend is running and the API keys are configured." />
      )}

      {/* ── DAILY RETURN HOOK — email, one thumb-scroll from the top ── */}
      <GlassSurface radius={10} blur={20} style={{ marginTop: 18, padding: 'clamp(14px, 4vw, 20px)' }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.16em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
          DAILY EDITION
        </div>
        <EmailCapture
          source="board"
          hideIfSubscribed
          headline="Tomorrow's locked calls, in your inbox at 08:00"
          sub="Every morning of the World Cup: the day's calls before kickoff, yesterday's receipts — hits and misses both. Free."
        />
      </GlassSurface>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginTop: 10, textAlign: 'center' }}>
        NEXT RECEIPTS PRINT ~2H AFTER FULL TIME · GRADED BY MACHINE, PUBLISHED EITHER WAY
      </div>

      {/* ── THE RECEIPTS — the proof (#receipts: LedgerStrip jumps here) ── */}
      <div id="receipts" style={{ marginTop: 28, scrollMarginTop: 56 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 className="font-display" style={{ fontSize: 'clamp(17px, 4.5vw, 21px)', fontWeight: 800, margin: 0 }}>
            The receipts
          </h2>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--danger)', textTransform: 'uppercase' }}>
            <DecryptedText text="our misses, printed too" speed={26} />
          </span>
        </div>
        <ScrollReveal><BrierScoreHero /></ScrollReveal>
        <ScrollReveal delay={70} style={{ marginTop: 16 }}><LedgerBreakdown /></ScrollReveal>
        <ScrollReveal delay={140} style={{ marginTop: 16 }}><TrackRecord onSelect={onSelect} /></ScrollReveal>
      </div>

      {/* ── MORE FIXTURES HINT ────────────────────────────────────── */}
      {fixtures.length > 6 && (
        <p style={{ textAlign: 'center', marginTop: 24, fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {fixtures.length} fixtures live — browse competitions via the sidebar
        </p>
      )}
    </div>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div className="animate-fade-in" style={{
      textAlign: 'center', padding: '64px 24px',
      border: '1px solid var(--border-default)',
      borderRadius: 6, background: 'var(--bg-surface)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <CalendarX size={32} color="var(--text-tertiary)" strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
