import React from 'react';
import { getTeamColor, getColor, DRAW_COLOR } from '../constants/teamColors.js';

export function LiveMatchStats({ stats, fixture }) {
  if (!stats || Object.keys(stats).length === 0) return <div style={{color:'#6B7280', fontSize:13, padding:16}}>Listening for live stats...</div>;

  const homeTeam = fixture?.homeTeam?.name;
  const awayTeam = fixture?.awayTeam?.name;
  const homeColor = getColor(homeTeam).primary;
  const awayColor = getColor(awayTeam).primary;

  const homeStats = stats[homeTeam] || {};
  const awayStats = stats[awayTeam] || {};

  const StatDualBar = ({ label, hVal, aVal, isPercent, isAnimated }) => {
    const total = hVal + aVal;
    const hPct = total > 0 ? (hVal / total) * 100 : 50;
    const aPct = 100 - hPct;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 13 }}>{hVal}{isPercent ? '%' : ''}</span>
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>{label}</span>
          <span style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 13 }}>{aVal}{isPercent ? '%' : ''}</span>
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${hPct}%`, background: homeColor, transition: isAnimated ? 'width 1s ease-in-out' : 'none' }} />
          <div style={{ width: `${aPct}%`, background: awayColor, transition: isAnimated ? 'width 1s ease-in-out' : 'none' }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
         <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#F9FAFB' }}>Live Match Stats</h3>
         <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: 12, fontWeight: 700 }}>
           <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
           LIVE
         </div>
       </div>

       <div style={{ marginBottom: 24 }}>
         <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 16 }}>ATTACKS & POSSESSION</div>
         <StatDualBar label="Ball Possession" hVal={parseInt(homeStats['Ball Possession']||50)} aVal={parseInt(awayStats['Ball Possession']||50)} isPercent isAnimated />
         <StatDualBar label="Shots Total" hVal={parseInt(homeStats['Total Shots']||0)} aVal={parseInt(awayStats['Total Shots']||0)} />
         <StatDualBar label="Shots on Target" hVal={parseInt(homeStats['Shots on Goal']||0)} aVal={parseInt(awayStats['Shots on Goal']||0)} />
         <StatDualBar label="Shots off Target" hVal={parseInt(homeStats['Shots off Goal']||0)} aVal={parseInt(awayStats['Shots off Goal']||0)} />
         <StatDualBar label="Blocked Shots" hVal={parseInt(homeStats['Blocked Shots']||0)} aVal={parseInt(awayStats['Blocked Shots']||0)} />
       </div>

       <div style={{ marginBottom: 24 }}>
         <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 16 }}>DANGER</div>
         <StatDualBar label="Dangerous Attacks" hVal={parseInt(homeStats['Dangerous Attacks']||0)} aVal={parseInt(awayStats['Dangerous Attacks']||0)} isAnimated />
         <StatDualBar label="Attacks Total" hVal={parseInt(homeStats['Attacks']||0)} aVal={parseInt(awayStats['Attacks']||0)} />
         <StatDualBar label="Corner Kicks" hVal={parseInt(homeStats['Corner Kicks']||0)} aVal={parseInt(awayStats['Corner Kicks']||0)} />
       </div>

       <div style={{ marginBottom: 24 }}>
         <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 16 }}>QUALITY</div>
         <StatDualBar label="Expected Goals (xG)" hVal={parseFloat(homeStats['expected_goals']||0)} aVal={parseFloat(awayStats['expected_goals']||0)} isAnimated />
       </div>

       <div style={{ marginBottom: 24 }}>
         <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 16 }}>DISCIPLINE</div>
         <StatDualBar label="Yellow Cards" hVal={parseInt(homeStats['Yellow Cards']||0)} aVal={parseInt(awayStats['Yellow Cards']||0)} />
         <StatDualBar label="Red Cards" hVal={parseInt(homeStats['Red Cards']||0)} aVal={parseInt(awayStats['Red Cards']||0)} />
         <StatDualBar label="Fouls" hVal={parseInt(homeStats['Fouls']||0)} aVal={parseInt(awayStats['Fouls']||0)} />
         <StatDualBar label="Offsides" hVal={parseInt(homeStats['Offsides']||0)} aVal={parseInt(awayStats['Offsides']||0)} />
       </div>

       <div style={{ marginBottom: 24 }}>
         <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 16 }}>PASSING</div>
         <StatDualBar label="Total Passes" hVal={parseInt(homeStats['Total passes']||0)} aVal={parseInt(awayStats['Total passes']||0)} />
         <StatDualBar label="Passes Accurate" hVal={parseInt(homeStats['Passes accurate']||0)} aVal={parseInt(awayStats['Passes accurate']||0)} />
       </div>
    </div>
  );
}
