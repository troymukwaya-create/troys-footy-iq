import React from 'react';
import { getTeamColor, getColor, DRAW_COLOR } from '../constants/teamColors.js';

export function MatchHeader({ fixture }) {
  const homeColor = getColor(fixture.homeTeam?.name).primary;
  const awayColor = getColor(fixture.awayTeam?.name).primary;
  
  const FormDots = ({ color }) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {['W','W','D','W','L'].map((s, i) => {
        let bg = s === 'W' ? color : s === 'D' ? DRAW_COLOR : '#3d0000';
        return <div key={i} title="Recent form" style={{ width: 8, height: 8, borderRadius: '50%', background: bg, margin: '0 2px' }} />;
      })}
    </div>
  );

  return (
    <div style={{ marginBottom: 20 }}>
      {fixture.league && (
        <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700, background: `${homeColor}33`, border: `1px solid ${homeColor}`, color: homeColor, marginBottom: 12 }}>
          {fixture.league.name}
        </div>
      )}
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px 0', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: homeColor }}>{fixture.homeTeam?.name}</span>
        <span style={{ color: '#6B7280', margin: '0 12px', fontSize: 20 }}>
           {fixture.score.home !== null ? `${fixture.score.home} - ${fixture.score.away}` : 'vs'}
        </span>
        <span style={{ color: awayColor }}>{fixture.awayTeam?.name}</span>
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <FormDots color={homeColor} />
        <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 700 }}>FORM</span>
        <FormDots color={awayColor} />
      </div>
      <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
        {new Date(fixture.date).toLocaleDateString()} · {fixture.venue}
      </div>
    </div>
  );
}
