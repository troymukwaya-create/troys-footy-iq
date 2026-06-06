import React from 'react';

export function TickerBar({ activeMatches }) {
  const events = [];
  if (!activeMatches || activeMatches.length === 0) {
    events.push("🏆 ODDYESSA — Welcome to the ultimate live sports prediction engine!");
    events.push("🕐 Waiting for kick-offs...");
  } else {
    activeMatches.forEach(m => {
      const score = m.score.home != null ? `${m.score.home}-${m.score.away}` : 'v';
      events.push(`⚽ ${m.homeTeam?.name} ${score} ${m.awayTeam?.name} (${m.minute || 0}')`);
    });
  }
  const text = events.join('   |   ');

  return (
    <div style={{
      height: 28, background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
      overflow: 'hidden', display: 'flex', alignItems: 'center', position: 'relative'
    }}>
      <style>{`
        @keyframes ticker { from { transform: translateX(100vw) } to { transform: translateX(-100%) } }
        .ticker-content { animation: ticker 30s linear infinite; white-space: nowrap; color: #9CA3AF; fontSize: 12px; font-weight: 600; padding: 0 20px;}
        .ticker-content:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-content" style={{ display: 'inline-block' }}>
        {text}
      </div>
    </div>
  );
}
