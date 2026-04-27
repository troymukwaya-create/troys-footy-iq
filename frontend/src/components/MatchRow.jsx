import React from 'react';
import { useStore } from '../store/useStore';
import { getTeamColor } from '../constants/teamColors';

export function oddsFromProb(prob, margin = 0.05) {
  if (!prob || prob <= 0) return '-';
  const fair = 1 / (prob / 100);
  const withMargin = fair * (1 - margin); // Lower odds slightly to add bookmaker margin (like real odds)
  return withMargin;
}

export function convertOdds(decimal, format) {
  if (!decimal || decimal === '-') return '-';
  const d = parseFloat(decimal);
  if (isNaN(d)) return '-';
  
  if (format === 'percentage') return Math.round(100 / d) + '%';
  if (format === 'fractional') {
    const profit = d - 1;
    const fractions = [
      [1,5],[1,4],[1,3],[2,5],[1,2],[3,5],[2,3],[4,5],[1,1],
      [6,5],[5,4],[4,3],[3,2],[8,5],[2,1],[5,2],[3,1],[4,1],[5,1],[6,1],[10,1]
    ];
    let closest = fractions[0];
    let minDiff = Infinity;
    for (const [n,d2] of fractions) {
      const diff = Math.abs(n/d2 - profit);
      if (diff < minDiff) { minDiff = diff; closest = [n,d2]; }
    }
    return closest[0] + '/' + closest[1];
  }
  return d.toFixed(2);
}

function OddsBtn({ value, color, small, onClick }) {
  const [clicked, setClicked] = React.useState(false);
  const format = useStore(s => s.oddsFormat);
  const label = convertOdds(value, format);

  return (
    <button
      onClick={e => {
        e.stopPropagation();
        setClicked(!clicked);
        if(onClick) onClick();
      }}
      style={{
        width: small ? 52 : 60, marginLeft: 4, padding: '5px 0',
        background: clicked ? color + '33' : '#1a1a1a',
        border: `1px solid ${clicked ? color : '#2a2a2a'}`,
        borderRadius: 6, fontSize: 12, fontWeight: 700,
        color: clicked ? color : '#F9FAFB',
        cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

export function MatchRow({ fixture, onSelect, isSelected }) {
  const hp = fixture.home_prob || 45;
  const dp = fixture.draw_prob || 25;
  const ap = 100 - hp - dp;
  const over25prob = fixture.over25_prob || 52;
  const under25prob = fixture.under25_prob || (100 - over25prob);
  const bttsprob = fixture.btts_prob || 48;

  const homeOdds  = oddsFromProb(hp);
  const drawOdds  = oddsFromProb(dp);
  const awayOdds  = oddsFromProb(ap);
  const overOdds  = oddsFromProb(over25prob);
  const underOdds = oddsFromProb(under25prob);
  const bttsOdds  = oddsFromProb(bttsprob);

  const isLive   = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const isDone   = fixture.status === 'FINISHED';
  const homeColor = getTeamColor(fixture.homeTeam?.name).primary;
  const awayColor = getTeamColor(fixture.awayTeam?.name).primary;

  function timeDisplay() {
    if (isLive)   return { text: fixture.status === 'PAUSED' ? 'HT' : fixture.minute + "'", color: '#22C55E' };
    if (isDone)   return { text: 'FT', color: '#6B7280' };
    return { text: new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), color: '#9CA3AF' };
  }

  const time = timeDisplay();

  return (
    <div
      onClick={() => onSelect(fixture)}
      style={{
        display: 'flex', alignItems: 'center', padding: '10px 12px',
        borderBottom: '1px solid #1a1a1a', cursor: 'pointer',
        background: isSelected ? '#1a0f0a' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Time */}
      <div style={{ width: 52, fontSize: 12, color: time.color, fontWeight: isLive ? 700 : 400, flexShrink: 0 }}>
        {isLive && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22C55E', marginRight: 4, animation: 'pulse 1.5s infinite' }} />}
        {time.text}
      </div>

      {/* Teams */}
      <div style={{ flex: 1, minWidth: 0, padding: '0 12px' }}>
        {/* Live/finished: show score inline */}
        {(isLive || isDone) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.homeTeam?.name}</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: homeColor, minWidth: 16, textAlign: 'center' }}>{fixture.score?.home ?? '-'}</span>
            <span style={{ fontSize: 11, color: '#4B5563' }}>-</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: awayColor, minWidth: 16, textAlign: 'center' }}>{fixture.score?.away ?? '-'}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{fixture.awayTeam?.name}</span>
          </div>
        ) : (
          // Pre-match: stacked team names
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.homeTeam?.name}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#D1D5DB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.awayTeam?.name}</div>
          </div>
        )}
      </div>

      {/* Odds buttons — only show for non-finished matches */}
      {!isDone ? (
        <>
          <OddsBtn value={homeOdds} color={homeColor} />
          <OddsBtn value={drawOdds} color="#6B7280"   />
          <OddsBtn value={awayOdds} color={awayColor} />
          <OddsBtn value={overOdds}  color="#3B82F6" small />
          <OddsBtn value={underOdds} color="#3B82F6" small />
          <OddsBtn value={bttsOdds}  color="#8B5CF6" small />
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#4B5563', width: 240, textAlign: 'right' }}>
          {fixture.halfTime?.home != null ? `HT ${fixture.halfTime.home}-${fixture.halfTime.away}` : ''}
        </div>
      )}

      {/* More markets button */}
      <button style={{
        marginLeft: 8, padding: '4px 8px', borderRadius: 4, fontSize: 11,
        background: '#1f1f1f', border: '1px solid #2a2a2a', color: '#9CA3AF', cursor: 'pointer', flexShrink: 0,
      }}>
        +14
      </button>
    </div>
  );
}
