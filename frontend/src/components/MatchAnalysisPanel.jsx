import React, { useState, useMemo } from 'react';

/**
 * MatchAnalysisPanel — Center panel showing full match analysis.
 * Includes: match header, probability bars, scoreline matrix, stats comparison.
 */
export function MatchAnalysisPanel({ fixture, analysis, isLoading }) {
  const [activeTab, setActiveTab] = useState('analysis');

  if (!fixture) return null;

  const home = fixture?.homeTeam?.name || 'Home';
  const away = fixture?.awayTeam?.name || 'Away';
  const homeCrest = fixture?.homeTeam?.crest || null;
  const awayCrest = fixture?.awayTeam?.crest || null;
  const league = fixture?.league?.name || '';
  const status = fixture?.status || 'SCHEDULED';
  const isLive = status === 'IN_PLAY' || status === 'PAUSED';

  const prob = analysis?.probability || null;
  const homeStats = analysis?.homeStats || null;
  const awayStats = analysis?.awayStats || null;
  const h2h = analysis?.h2h || null;

  const tabs = [
    { id: 'analysis', label: 'Analysis' },
    { id: 'stats', label: 'Stats' },
    { id: 'h2h', label: 'H2H' },
    { id: 'markets', label: 'Markets' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto animate-fade-in">
      {/* ─── Match Header ─────────────────────────────────────────── */}
      <div className="glass-panel-solid rounded-2xl p-6 mb-4">
        {/* League */}
        <div className="text-center mb-4">
          <span className="text-[10px] uppercase tracking-widest text-cyan-400/60 font-semibold">{league}</span>
          {fixture?.league?.round && (
            <span className="text-[10px] text-white/20 ml-2">· {fixture.league.round}</span>
          )}
        </div>

        {/* Teams + Score */}
        <div className="flex items-center justify-center gap-6 md:gap-10">
          {/* Home */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {homeCrest && <img src={homeCrest} alt="" className="w-14 h-14 md:w-16 md:h-16 object-contain" onError={e => e.target.style.display='none'} />}
            <span className="text-sm md:text-base font-bold text-center leading-tight">{home}</span>
            {homeStats?.form && homeStats.form !== 'N/A' && (
              <div className="flex gap-0.5">
                {homeStats.form.split('').slice(0, 5).map((r, i) => (
                  <span key={i} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                    r === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                    r === 'D' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{r}</span>
                ))}
              </div>
            )}
          </div>

          {/* Score */}
          <div className="flex flex-col items-center gap-1">
            {isLive && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold">{fixture?.minute || ''}′</span>
              </div>
            )}
            <div className="score-box rounded-xl px-5 py-3 flex items-center gap-3">
              <span className="text-2xl md:text-3xl font-black tabular-nums">
                {fixture?.score?.home ?? '–'}
              </span>
              <span className="text-white/20 text-lg">:</span>
              <span className="text-2xl md:text-3xl font-black tabular-nums">
                {fixture?.score?.away ?? '–'}
              </span>
            </div>
            {status === 'SCHEDULED' && fixture?.date && (
              <span className="text-[10px] text-white/30 mt-1">
                {new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {status === 'FINISHED' && (
              <span className="text-[10px] text-white/30 mt-1 font-semibold">FULL TIME</span>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {awayCrest && <img src={awayCrest} alt="" className="w-14 h-14 md:w-16 md:h-16 object-contain" onError={e => e.target.style.display='none'} />}
            <span className="text-sm md:text-base font-bold text-center leading-tight">{away}</span>
            {awayStats?.form && awayStats.form !== 'N/A' && (
              <div className="flex gap-0.5">
                {awayStats.form.split('').slice(0, 5).map((r, i) => (
                  <span key={i} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                    r === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                    r === 'D' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{r}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Win Probability Bar */}
        {prob && (
          <div className="mt-6">
            <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
              <span className="font-semibold text-cyan-400">{prob.probabilities?.home || 0}%</span>
              <span>{prob.probabilities?.draw || 0}%</span>
              <span className="font-semibold text-amber-400">{prob.probabilities?.away || 0}%</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div
                className="bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-l-full transition-all duration-700"
                style={{ width: `${prob.probabilities?.home || 33}%` }}
              />
              <div
                className="bg-white/15 transition-all duration-700"
                style={{ width: `${prob.probabilities?.draw || 33}%` }}
              />
              <div
                className="bg-gradient-to-r from-amber-400 to-amber-500 rounded-r-full transition-all duration-700"
                style={{ width: `${prob.probabilities?.away || 33}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-white/25 mt-1">
              <span>{home}</span>
              <span>Draw</span>
              <span>{away}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Loading State ────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton h-24 w-full" />
          ))}
        </div>
      )}

      {/* ─── Tabs ─────────────────────────────────────────────────── */}
      {!isLoading && prob && (
        <>
          <div className="flex gap-1 mb-4 bg-white/[0.03] rounded-xl p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/15 text-cyan-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── Analysis Tab ──────────────────────────────────────── */}
          {activeTab === 'analysis' && (
            <div className="space-y-4 animate-fade-in">
              {/* Expected Goals */}
              <div className="glass-panel rounded-xl p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">Expected Goals (Poisson Model)</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-black text-cyan-400">{prob.expectedGoals?.home || '–'}</div>
                    <div className="text-[10px] text-white/30 mt-1">{home}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white/60">{prob.expectedGoals?.total || '–'}</div>
                    <div className="text-[10px] text-white/30 mt-1">Total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-amber-400">{prob.expectedGoals?.away || '–'}</div>
                    <div className="text-[10px] text-white/30 mt-1">{away}</div>
                  </div>
                </div>
              </div>

              {/* Risk Level */}
              <div className={`rounded-xl p-4 flex items-center gap-3 ${
                prob.riskLevel === 'LOW' ? 'risk-low' :
                prob.riskLevel === 'MEDIUM' ? 'risk-medium' :
                'risk-high'
              }`}>
                <span className="text-xl">
                  {prob.riskLevel === 'LOW' ? '🟢' : prob.riskLevel === 'MEDIUM' ? '🟡' : '🔴'}
                </span>
                <div>
                  <div className="text-xs font-bold">{prob.riskLevel} RISK</div>
                  <div className="text-[10px] opacity-70">
                    {prob.riskLevel === 'LOW' ? 'Strong statistical confidence in the outcome'
                      : prob.riskLevel === 'MEDIUM' ? 'Moderate confidence — multiple outcomes possible'
                      : 'Low confidence — unpredictable match'}
                  </div>
                </div>
              </div>

              {/* Scoreline Matrix */}
              <ScorelineMatrix topScorelines={prob.topScorelines} home={home} away={away} />

              {/* Goal Markets */}
              <div className="glass-panel rounded-xl p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">Goal Markets</h3>
                <div className="space-y-2">
                  <MarketRow label="Over 2.5 Goals" value={prob.overUnder?.over25} />
                  <MarketRow label="Under 2.5 Goals" value={prob.overUnder?.under25} />
                  <MarketRow label="Over 1.5 Goals" value={prob.overUnder?.over15} />
                  <MarketRow label="Over 3.5 Goals" value={prob.overUnder?.over35} />
                  <MarketRow label="BTTS Yes" value={prob.btts?.yes} />
                  <MarketRow label="BTTS No" value={prob.btts?.no} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Stats Tab ─────────────────────────────────────────── */}
          {activeTab === 'stats' && (
            <div className="glass-panel rounded-xl p-4 animate-fade-in">
              <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-4">Team Comparison</h3>
              <div className="space-y-3">
                <StatRow label="Avg Goals Scored" home={homeStats?.avgGoalsFor} away={awayStats?.avgGoalsFor} />
                <StatRow label="Avg Goals Conceded" home={homeStats?.avgGoalsAgainst} away={awayStats?.avgGoalsAgainst} inverted />
                <StatRow label="Matches Played" home={homeStats?.played} away={awayStats?.played} />
                <StatRow label="Wins" home={homeStats?.wins} away={awayStats?.wins} />
                <StatRow label="Draws" home={homeStats?.draws} away={awayStats?.draws} />
                <StatRow label="Losses" home={homeStats?.losses} away={awayStats?.losses} inverted />
                <StatRow label="Goals For" home={homeStats?.goalsFor} away={awayStats?.goalsFor} />
                <StatRow label="Goals Against" home={homeStats?.goalsAgainst} away={awayStats?.goalsAgainst} inverted />
              </div>
            </div>
          )}

          {/* ─── H2H Tab ───────────────────────────────────────────── */}
          {activeTab === 'h2h' && (
            <div className="space-y-4 animate-fade-in">
              {h2h && h2h.totalMatches > 0 ? (
                <>
                  <div className="glass-panel rounded-xl p-4">
                    <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">Head to Head Summary</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-xl font-black text-cyan-400">{h2h.homeWins}</div>
                        <div className="text-[10px] text-white/30">{home} Wins</div>
                      </div>
                      <div>
                        <div className="text-xl font-black text-white/40">{h2h.draws}</div>
                        <div className="text-[10px] text-white/30">Draws</div>
                      </div>
                      <div>
                        <div className="text-xl font-black text-amber-400">{h2h.awayWins}</div>
                        <div className="text-[10px] text-white/30">{away} Wins</div>
                      </div>
                    </div>
                    <div className="text-center mt-3 text-xs text-white/30">
                      Avg {h2h.avgGoals} goals/match · {h2h.totalMatches} meetings
                    </div>
                  </div>

                  {/* Recent Meetings */}
                  <div className="glass-panel rounded-xl p-4">
                    <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">Recent Meetings</h3>
                    <div className="space-y-2">
                      {(h2h.matches || []).slice(0, 5).map((m, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 text-xs">
                          <span className="text-white/40 text-[10px] w-20">
                            {m.date ? new Date(m.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : ''}
                          </span>
                          <span className={`font-semibold ${m.winner === m.home ? 'text-cyan-400' : 'text-white/60'}`}>{m.home}</span>
                          <span className="font-bold text-white/80 px-2">{m.homeGoals ?? '?'} - {m.awayGoals ?? '?'}</span>
                          <span className={`font-semibold ${m.winner === m.away ? 'text-amber-400' : 'text-white/60'}`}>{m.away}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-panel rounded-xl p-8 text-center text-white/30">
                  <div className="text-2xl mb-2">📊</div>
                  <div className="text-xs">No H2H data available</div>
                </div>
              )}
            </div>
          )}

          {/* ─── Markets Tab ───────────────────────────────────────── */}
          {activeTab === 'markets' && (
            <div className="glass-panel rounded-xl p-4 animate-fade-in">
              <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">All Markets</h3>
              <div className="space-y-2">
                {(prob.markets || []).map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        m.risk === 'LOW' ? 'bg-emerald-400' :
                        m.risk === 'MEDIUM' ? 'bg-amber-400' :
                        'bg-red-400'
                      }`} />
                      <span className="text-xs text-white/70">{m.name}</span>
                      <span className="text-[9px] text-white/20">{m.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 prob-bar">
                        <div
                          className="prob-bar-fill"
                          style={{
                            width: `${Math.min(m.probability, 100)}%`,
                            background: m.risk === 'LOW' ? '#22c55e' : m.risk === 'MEDIUM' ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold w-10 text-right" style={{
                        color: m.risk === 'LOW' ? '#4ade80' : m.risk === 'MEDIUM' ? '#fbbf24' : '#f87171',
                      }}>
                        {m.probability}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function ScorelineMatrix({ topScorelines, home, away }) {
  if (!topScorelines || topScorelines.length === 0) return null;

  return (
    <div className="glass-panel rounded-xl p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-cyan-400/50 font-bold mb-3">Top Scorelines</h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {topScorelines.map((s, i) => {
          const intensity = Math.min(s.probability / 15, 1);
          return (
            <div
              key={i}
              className="matrix-cell h-14 flex-col"
              style={{
                background: `rgba(0, 229, 255, ${0.04 + intensity * 0.15})`,
                border: `1px solid rgba(0, 229, 255, ${0.08 + intensity * 0.2})`,
              }}
            >
              <span className="text-base font-black">{s.score}</span>
              <span className="text-[9px] text-cyan-400/60">{s.probability}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketRow({ label, value }) {
  const v = value ?? 0;
  const color = v >= 65 ? '#22c55e' : v >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 prob-bar">
          <div className="prob-bar-fill" style={{ width: `${Math.min(v, 100)}%`, background: color }} />
        </div>
        <span className="text-xs font-bold w-10 text-right" style={{ color }}>{v}%</span>
      </div>
    </div>
  );
}

function StatRow({ label, home, away, inverted = false }) {
  const h = home ?? 0;
  const a = away ?? 0;
  const hBetter = inverted ? h < a : h > a;
  const aBetter = inverted ? a < h : a > h;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <span className={`text-xs font-semibold w-16 text-right ${hBetter ? 'text-cyan-400' : 'text-white/50'}`}>
        {typeof h === 'number' && h % 1 !== 0 ? h.toFixed(2) : h}
      </span>
      <span className="text-[10px] text-white/30 flex-1 text-center">{label}</span>
      <span className={`text-xs font-semibold w-16 text-left ${aBetter ? 'text-amber-400' : 'text-white/50'}`}>
        {typeof a === 'number' && a % 1 !== 0 ? a.toFixed(2) : a}
      </span>
    </div>
  );
}
