import React, { useMemo } from 'react';
import { useBriefing } from '../hooks/useQueries.js';

/**
 * AnalystDashboard — Center panel when no fixture is selected.
 * Shows daily briefing, live matches overview, and upcoming fixtures.
 */
export function AnalystDashboard({ fixtures = [], onSelect }) {
  const { data: briefing } = useBriefing(fixtures);

  const liveMatches = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED'),
    [fixtures]
  );

  const upcomingToday = useMemo(() => {
    const today = new Date().toDateString();
    return (fixtures || []).filter(f =>
      f.status === 'SCHEDULED' && new Date(f.date).toDateString() === today
    );
  }, [fixtures]);

  const recentResults = useMemo(() =>
    (fixtures || []).filter(f => f.status === 'FINISHED').slice(0, 6),
    [fixtures]
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-xl md:text-2xl font-headline font-black tracking-tight">
          <span className="text-cyan-400">Analytics</span> Dashboard
        </h1>
        <p className="text-xs text-white/30 mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Daily Briefing */}
      {briefing && (
        <div className="glass-panel-solid rounded-2xl p-5 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="text-xs font-black uppercase tracking-widest text-cyan-400/60">Daily Briefing</h2>
          </div>

          {briefing.headline && (
            <p className="text-sm text-white/70 font-medium mb-4">{briefing.headline}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {briefing.gameOfTheDay && (
              <div className="rounded-xl p-3 bg-cyan-500/[0.05] border border-cyan-500/10">
                <div className="text-[9px] uppercase tracking-widest text-cyan-400/40 font-bold mb-1">Game of the Day</div>
                <div className="text-xs font-bold text-white/80 mb-1">{briefing.gameOfTheDay.fixture}</div>
                <div className="text-[10px] text-white/40">{briefing.gameOfTheDay.why}</div>
              </div>
            )}
            {briefing.avoid && (
              <div className="rounded-xl p-3 bg-red-500/[0.05] border border-red-500/10">
                <div className="text-[9px] uppercase tracking-widest text-red-400/40 font-bold mb-1">Avoid</div>
                <div className="text-xs font-bold text-white/80 mb-1">{briefing.avoid.fixture}</div>
                <div className="text-[10px] text-white/40">{briefing.avoid.why}</div>
              </div>
            )}
          </div>

          {briefing.topPick && (
            <div className="mt-3 rounded-xl p-3 bg-emerald-500/[0.05] border border-emerald-500/10">
              <div className="text-[9px] uppercase tracking-widest text-emerald-400/40 font-bold mb-1">Top Pick</div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white/80">{briefing.topPick.fixture}</span>
                  <span className="text-xs text-white/40 ml-2">— {briefing.topPick.market}</span>
                </div>
                {briefing.topPick.confidence && (
                  <span className="text-xs font-bold text-emerald-400">{briefing.topPick.confidence}%</span>
                )}
              </div>
              {briefing.topPick.reasoning && (
                <div className="text-[10px] text-white/30 mt-1">{briefing.topPick.reasoning}</div>
              )}
            </div>
          )}

          {briefing.summary && (
            <p className="text-[10px] text-white/25 mt-3">{briefing.summary}</p>
          )}
        </div>
      )}

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400/60">Live Now</h2>
            <span className="text-[10px] text-white/20">{liveMatches.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {liveMatches.map(f => (
              <LiveMatchCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Today */}
      {upcomingToday.length > 0 && (
        <div className="animate-fade-in">
          <h2 className="text-xs font-black uppercase tracking-widest text-white/30 mb-3">Coming Up Today</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {upcomingToday.slice(0, 8).map(f => (
              <UpcomingCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <div className="animate-fade-in">
          <h2 className="text-xs font-black uppercase tracking-widest text-white/30 mb-3">Recent Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recentResults.map(f => (
              <ResultCard key={f.id} fixture={f} onClick={() => onSelect?.(f)} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {fixtures.length === 0 && (
        <div className="text-center py-20 text-white/30">
          <div className="text-4xl mb-3">⚽</div>
          <div className="text-sm font-semibold mb-1">No fixtures available</div>
          <div className="text-xs text-white/20">Check that the backend is running at localhost:3001</div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function LiveMatchCard({ fixture, onClick }) {
  return (
    <div
      onClick={onClick}
      className="match-card glass-panel rounded-xl p-3 border border-emerald-500/10 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-white/25">{fixture.league?.name || ''}</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-400 font-bold">{fixture.minute ? `${fixture.minute}'` : 'LIVE'}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {fixture.homeTeam?.crest && <img src={fixture.homeTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
          <span className="text-xs font-semibold text-white/80 truncate">{fixture.homeTeam?.name || 'Home'}</span>
        </div>
        <span className="text-sm font-black text-emerald-400 px-2">
          {fixture.score?.home ?? 0} - {fixture.score?.away ?? 0}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-xs font-semibold text-white/80 truncate text-right">{fixture.awayTeam?.name || 'Away'}</span>
          {fixture.awayTeam?.crest && <img src={fixture.awayTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
        </div>
      </div>
    </div>
  );
}

function UpcomingCard({ fixture, onClick }) {
  const time = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div onClick={onClick} className="match-card glass-panel rounded-xl p-3 border border-white/[0.03] cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-white/25">{fixture.league?.name || ''}</span>
        <span className="text-[9px] text-white/20">{time}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {fixture.homeTeam?.crest && <img src={fixture.homeTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
          <span className="text-xs text-white/60 truncate">{fixture.homeTeam?.name || 'Home'}</span>
        </div>
        <span className="text-[10px] text-white/15 px-2">vs</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-xs text-white/60 truncate text-right">{fixture.awayTeam?.name || 'Away'}</span>
          {fixture.awayTeam?.crest && <img src={fixture.awayTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
        </div>
      </div>
      {fixture.ai_risk && (
        <div className="flex items-center gap-1 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            fixture.ai_risk === 'LOW' ? 'bg-emerald-400' :
            fixture.ai_risk === 'MEDIUM' ? 'bg-amber-400' : 'bg-red-400'
          }`} />
          <span className="text-[9px] text-white/20">{fixture.ai_pick || fixture.ai_risk}</span>
        </div>
      )}
    </div>
  );
}

function ResultCard({ fixture, onClick }) {
  const homeWon = (fixture.score?.home ?? 0) > (fixture.score?.away ?? 0);
  const awayWon = (fixture.score?.away ?? 0) > (fixture.score?.home ?? 0);

  return (
    <div onClick={onClick} className="match-card glass-panel rounded-xl p-3 border border-white/[0.03] cursor-pointer opacity-70 hover:opacity-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-white/25">{fixture.league?.name || ''}</span>
        <span className="text-[9px] text-white/15">FT</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {fixture.homeTeam?.crest && <img src={fixture.homeTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
          <span className={`text-xs truncate ${homeWon ? 'font-bold text-white/80' : 'text-white/40'}`}>{fixture.homeTeam?.name || 'Home'}</span>
        </div>
        <span className="text-xs font-black text-white/50 px-2">
          {fixture.score?.home ?? '?'} - {fixture.score?.away ?? '?'}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-xs truncate text-right ${awayWon ? 'font-bold text-white/80' : 'text-white/40'}`}>{fixture.awayTeam?.name || 'Away'}</span>
          {fixture.awayTeam?.crest && <img src={fixture.awayTeam.crest} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />}
        </div>
      </div>
    </div>
  );
}
