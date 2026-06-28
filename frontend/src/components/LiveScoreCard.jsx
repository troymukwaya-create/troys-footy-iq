import React from 'react';
import { Link } from 'react-router-dom';
import { VersusHero, T, disp, label } from './fixture/primitives.jsx';
import { fixtureView } from './fixture/oddData.js';

// Compact match card on the new brand identity — the shared VersusHero seam
// motif (two flags on a diagonal seam, score/VS on the fold) with the league
// + live/FT status baked into the banner. Replaces the old emerald card.
export default function LiveScoreCard({ match }) {
  if (!match) return null;
  const v = fixtureView(match);

  return (
    <Link to={`/live/${match.id}`} className="block h-full group" style={{ textDecoration: 'none' }}>
      <div
        className="lsc-card"
        style={{
          position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
          background: T.raised, border: '1px solid ' + T.b2, borderRadius: 12,
          overflow: 'hidden', isolation: 'isolate',
          transition: 'border-color 180ms ease, transform 180ms ease',
        }}
      >
        <VersusHero
          v={v} t={{ accent: T.accent, colorMode: 'nation', density: 5, flagBg: false }}
          h={120} meta codes codeSize={18} disc={20} seam={[60, 40]} discTop={48}
        />
        <div style={{ padding: '12px 14px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
            <span style={{ ...disp(13.5, 700), color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.homeTeam?.name}</span>
            <span style={{ ...label(8.5), color: T.t3 }}>v</span>
            <span style={{ ...disp(13.5, 700), color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.awayTeam?.name}</span>
          </span>
          <span style={{ ...label(8), color: T.t4, flexShrink: 0 }}>›</span>
        </div>
      </div>
      <style>{`.lsc-card:hover{ border-color:${T.b3}; transform:translateY(-1px); }`}</style>
    </Link>
  );
}
