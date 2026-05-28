import React from 'react';
import { motion } from 'motion/react';
import { getVisibleTeamColor } from '../constants/teamColors.js';

export default function WinProbBar({
  homePct, drawPct, awayPct,
  homeName = 'Home', awayName = 'Away',
  animate = true,
}) {
  const homeColor = getVisibleTeamColor(homeName);
  const awayColor = getVisibleTeamColor(awayName);
  const segments = [
    { pct: homePct, label: homeName, color: homeColor, key: 'home' },
    { pct: drawPct, label: 'Draw',   color: 'var(--calibration-slate)', key: 'draw' },
    { pct: awayPct, label: awayName, color: awayColor, key: 'away' },
  ];

  return (
    <div className="w-full space-y-1.5">
      {/* Labels row */}
      <div className="flex justify-between text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        <span className="truncate max-w-[35%]">{homeName}</span>
        <span>Draw</span>
        <span className="truncate max-w-[35%] text-right">{awayName}</span>
      </div>

      {/* Bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
        {segments.map(({ pct, color, key }) =>
          animate ? (
            <motion.div
              key={key}
              initial={{ width: 0 }}
              animate={{ width: `${pct ?? 0}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: color, height: '100%' }}
            />
          ) : (
            <div
              key={key}
              style={{ width: `${pct ?? 0}%`, background: color, height: '100%' }}
            />
          )
        )}
      </div>

      {/* Percentage row */}
      <div className="flex justify-between tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
        <span style={{ color: homeColor }}>{homePct ?? '—'}%</span>
        <span style={{ color: 'var(--calibration-slate)' }}>{drawPct ?? '—'}%</span>
        <span style={{ color: awayColor }}>{awayPct ?? '—'}%</span>
      </div>
    </div>
  );
}
