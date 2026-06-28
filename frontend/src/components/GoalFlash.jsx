import React from 'react';

/**
 * GoalFlash — Animated goal notification overlay.
 */
export function GoalFlash({ flashes }) {
  if (!flashes || flashes.length === 0) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {flashes.map((flash, i) => {
        if (!flash) return null;
        return (
          <div
            key={`${flash.fixtureId || i}-${flash.minute || 0}-${i}`}
            className="rounded-2xl py-4 px-6 flex items-center gap-4 min-w-[320px] max-w-[480px]"
            style={{
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              animation: 'slideDown 0.4s ease, fadeOut 0.5s 7.5s forwards',
              boxShadow: '0 0 40px rgba(34, 197, 94, 0.5)',
            }}
          >
            <span className="text-4xl">⚽</span>
            <div>
              <div className="text-xl font-black text-white">GOAL!</div>
              <div className="text-sm text-white/90 font-semibold">
                {flash.scoringTeam || 'Goal'} · {flash.minute || '?'}'
              </div>
              <div className="text-lg font-bold text-white mt-0.5">
                {flash.homeTeam || 'Home'} {flash.newScore?.home ?? '?'} - {flash.newScore?.away ?? '?'} {flash.awayTeam || 'Away'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
