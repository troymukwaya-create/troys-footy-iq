import React from 'react';

/**
 * FixtureCard — Compact match card for the left sidebar fixture list.
 * FotMob-inspired with team crests, score, and subtle risk indicator.
 */
export function FixtureCard({ fixture, isSelected, onClick }) {
  if (!fixture) return null;

  const home = fixture.homeTeam?.name || 'TBD';
  const away = fixture.awayTeam?.name || 'TBD';
  const homeCrest = fixture.homeTeam?.crest || null;
  const awayCrest = fixture.awayTeam?.crest || null;
  const status = fixture.status || 'SCHEDULED';
  const isLive = status === 'IN_PLAY' || status === 'PAUSED';
  const isFinished = status === 'FINISHED';
  const scoreHome = fixture.score?.home;
  const scoreAway = fixture.score?.away;
  const minute = fixture.minute;

  const time = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onClick={onClick}
      className={`match-card rounded-lg border mb-1 px-3 py-2.5 ${
        isSelected
          ? 'active border-cyan-500/25 bg-cyan-500/[0.06]'
          : 'border-white/[0.03] bg-white/[0.01] hover:border-white/[0.08]'
      }`}
    >
      {/* League + Time row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-white/25 truncate max-w-[60%]">
          {fixture.league?.name || ''}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {minute ? `${minute}'` : 'LIVE'}
            </span>
          )}
          {isFinished && (
            <span className="text-[9px] text-white/20 font-semibold">FT</span>
          )}
          {!isLive && !isFinished && (
            <span className="text-[9px] text-white/20">{time}</span>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="space-y-1.5">
        {/* Home */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {homeCrest && (
              <img src={homeCrest} alt="" className="w-4 h-4 object-contain flex-shrink-0" onError={e => e.target.style.display='none'} />
            )}
            <span className={`text-xs truncate ${isFinished && scoreHome > scoreAway ? 'font-bold text-white/90' : 'text-white/60'}`}>
              {home}
            </span>
          </div>
          <span className={`text-xs font-bold tabular-nums w-5 text-right ${
            isLive ? 'text-emerald-400' :
            isFinished && scoreHome > scoreAway ? 'text-white/90' :
            'text-white/50'
          }`}>
            {scoreHome ?? ''}
          </span>
        </div>

        {/* Away */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {awayCrest && (
              <img src={awayCrest} alt="" className="w-4 h-4 object-contain flex-shrink-0" onError={e => e.target.style.display='none'} />
            )}
            <span className={`text-xs truncate ${isFinished && scoreAway > scoreHome ? 'font-bold text-white/90' : 'text-white/60'}`}>
              {away}
            </span>
          </div>
          <span className={`text-xs font-bold tabular-nums w-5 text-right ${
            isLive ? 'text-emerald-400' :
            isFinished && scoreAway > scoreHome ? 'text-white/90' :
            'text-white/50'
          }`}>
            {scoreAway ?? ''}
          </span>
        </div>
      </div>

      {/* Probability Engine Output */}
      {fixture.probability ? (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.04]">
          {/* Win Probabilities */}
          <div className="flex items-center justify-between text-[10px] mb-2 font-medium">
            <span className="text-white/50">H: <span className="text-white/90">{fixture.probability.probabilities?.home ?? '-'}%</span></span>
            <span className="text-white/50">D: <span className="text-white/90">{fixture.probability.probabilities?.draw ?? '-'}%</span></span>
            <span className="text-white/50">A: <span className="text-white/90">{fixture.probability.probabilities?.away ?? '-'}%</span></span>
          </div>
          
          <div className="flex items-center justify-between text-[9px]">
            {/* Risk Level */}
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
                fixture.probability.riskLevel === 'LOW' ? 'bg-emerald-400 shadow-emerald-400/50' :
                fixture.probability.riskLevel === 'MEDIUM' ? 'bg-amber-400 shadow-amber-400/50' :
                'bg-red-400 shadow-red-400/50'
              }`} />
              <span className={`font-bold tracking-wider ${
                fixture.probability.riskLevel === 'LOW' ? 'text-emerald-400' :
                fixture.probability.riskLevel === 'MEDIUM' ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {fixture.probability.riskLevel ?? 'UNKNOWN'}
              </span>
            </div>
            
            {/* Top Scorelines */}
            <div className="flex items-center gap-1.5">
              {fixture.probability.topScorelines?.slice(0, 2).map((sl, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.04] text-white/70 font-semibold tabular-nums">
                  {sl.score}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Loading/Fallback UI */
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.04]">
          <div className="h-2.5 w-full bg-white/[0.03] rounded animate-pulse mb-2.5"></div>
          <div className="flex justify-between items-center">
            <div className="h-2.5 w-12 bg-white/[0.03] rounded animate-pulse"></div>
            <div className="h-4 w-16 bg-white/[0.03] rounded-md animate-pulse"></div>
          </div>
        </div>
      )}
    </div>
  );
}
