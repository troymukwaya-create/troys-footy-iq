import React, { useState } from 'react';
import { LiveOddsPanel } from './LiveOddsPanel.jsx';

/**
 * MatchAnalysisPanel — Center panel for match analysis.
 * Clean, structured: header → tabs → content.
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
    <div className="animate-fade-in" style={{ padding: '24px' }}>
      {/* ─── Match Header ─────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        {/* League */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{league}</span>
          {fixture?.league?.round && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>· {fixture.league.round}</span>
          )}
        </div>

        {/* Teams + Score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          {/* Home */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            {homeCrest && <img src={homeCrest} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{home}</span>
            {homeStats?.form && homeStats.form !== 'N/A' && <FormStrip form={homeStats.form} />}
          </div>

          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {isLive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
                <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>{fixture?.minute || ''}′</span>
              </div>
            )}
            <div className="score-box" style={{ borderRadius: 'var(--radius-lg)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fixture?.score?.home ?? '–'}</span>
              <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>:</span>
              <span style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fixture?.score?.away ?? '–'}</span>
            </div>
            {status === 'SCHEDULED' && fixture?.date && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {status === 'FINISHED' && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>FULL TIME</span>
            )}
          </div>

          {/* Away */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            {awayCrest && <img src={awayCrest} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{away}</span>
            {awayStats?.form && awayStats.form !== 'N/A' && <FormStrip form={awayStats.form} />}
          </div>
        </div>

        {/* Win Probability Bar */}
        {prob && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{prob.probabilities?.home || 0}%</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{prob.probabilities?.draw || 0}%</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>{prob.probabilities?.away || 0}%</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <div style={{ width: `${prob.probabilities?.home || 33}%`, background: 'var(--accent)', borderRadius: '4px 0 0 4px', transition: 'width 600ms ease' }} />
              <div style={{ width: `${prob.probabilities?.draw || 33}%`, background: 'rgba(255,255,255,0.12)', transition: 'width 600ms ease' }} />
              <div style={{ width: `${prob.probabilities?.away || 33}%`, background: 'var(--warning)', borderRadius: '0 4px 4px 0', transition: 'width 600ms ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{home}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Draw</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{away}</span>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      )}

      {/* Tabs */}
      {!isLoading && prob && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: activeTab === tab.id ? 'var(--accent-muted)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-tertiary)',
                  transition: 'all 150ms ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Expected Goals */}
              <div className="card" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 12 }}>Expected Goals</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{prob.expectedGoals?.home || '–'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{home}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-secondary)' }}>{prob.expectedGoals?.total || '–'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Total</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--warning)' }}>{prob.expectedGoals?.away || '–'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{away}</div>
                  </div>
                </div>
              </div>

              {/* Risk Level */}
              <div className={prob.riskLevel === 'LOW' ? 'risk-low' : prob.riskLevel === 'MEDIUM' ? 'risk-medium' : 'risk-high'}
                style={{ borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>
                  {prob.riskLevel === 'LOW' ? '🟢' : prob.riskLevel === 'MEDIUM' ? '🟡' : '🔴'}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{prob.riskLevel} RISK</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {prob.riskLevel === 'LOW' ? 'Strong statistical confidence' : prob.riskLevel === 'MEDIUM' ? 'Multiple outcomes possible' : 'Unpredictable match'}
                  </div>
                </div>
              </div>

              {/* Scorelines */}
              <ScorelineGrid topScorelines={prob.topScorelines} />

              {/* Goal Markets */}
              <div className="card" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 12 }}>Goal Markets</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MarketBar label="Over 2.5" value={prob.overUnder?.over25} />
                  <MarketBar label="Under 2.5" value={prob.overUnder?.under25} />
                  <MarketBar label="Over 1.5" value={prob.overUnder?.over15} />
                  <MarketBar label="Over 3.5" value={prob.overUnder?.over35} />
                  <MarketBar label="BTTS Yes" value={prob.btts?.yes} />
                  <MarketBar label="BTTS No" value={prob.btts?.no} />
                </div>
              </div>
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="card animate-fade-in" style={{ padding: 16 }}>
              <div className="section-title" style={{ marginBottom: 16 }}>Team Comparison</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

          {/* H2H Tab */}
          {activeTab === 'h2h' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {h2h && h2h.totalMatches > 0 ? (
                <>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="section-title" style={{ marginBottom: 12 }}>Head to Head</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{h2h.homeWins}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{home} Wins</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-tertiary)' }}>{h2h.draws}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Draws</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{h2h.awayWins}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{away} Wins</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      Avg {h2h.avgGoals} goals/match · {h2h.totalMatches} meetings
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="section-title" style={{ marginBottom: 12 }}>Recent Meetings</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(h2h.matches || []).slice(0, 5).map((m, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none', fontSize: 12,
                        }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 72 }}>
                            {m.date ? new Date(m.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : ''}
                          </span>
                          <span style={{ fontWeight: m.winner === m.home ? 600 : 400, color: m.winner === m.home ? 'var(--accent)' : 'var(--text-secondary)' }}>{m.home}</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', padding: '0 8px' }}>{m.homeGoals ?? '?'} - {m.awayGoals ?? '?'}</span>
                          <span style={{ fontWeight: m.winner === m.away ? 600 : 400, color: m.winner === m.away ? 'var(--warning)' : 'var(--text-secondary)' }}>{m.away}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <div style={{ fontSize: 11 }}>No H2H data available</div>
                </div>
              )}
            </div>
          )}

          {/* Markets Tab */}
          {activeTab === 'markets' && (
            <div className="animate-fade-in">
              <LiveOddsPanel fixture={fixture} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function FormStrip({ form }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {form.split('').slice(0, 5).map((r, i) => (
        <span key={i} style={{
          width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700,
          background: r === 'W' ? 'var(--success-muted)' : r === 'D' ? 'var(--warning-muted)' : 'var(--danger-muted)',
          color: r === 'W' ? 'var(--success)' : r === 'D' ? 'var(--warning)' : 'var(--danger)',
        }}>{r}</span>
      ))}
    </div>
  );
}

function ScorelineGrid({ topScorelines }) {
  if (!topScorelines || topScorelines.length === 0) return null;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-title" style={{ marginBottom: 12 }}>Top Scorelines</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
        {topScorelines.map((s, i) => {
          const intensity = Math.min(s.probability / 15, 1);
          return (
            <div key={i} className="matrix-cell" style={{
              flexDirection: 'column', height: 52,
              background: `rgba(59,130,246, ${0.04 + intensity * 0.12})`,
              border: `1px solid rgba(59,130,246, ${0.08 + intensity * 0.15})`,
            }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{s.score}</span>
              <span style={{ fontSize: 9, color: 'var(--accent)', opacity: 0.7 }}>{s.probability}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketBar({ label, value }) {
  const v = value ?? 0;
  const color = v >= 65 ? 'var(--success)' : v >= 45 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 80, flexShrink: 0 }}>{label}</span>
      <div className="prob-bar" style={{ flex: 1 }}>
        <div className="prob-bar-fill" style={{ width: `${Math.min(v, 100)}%`, background: color }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, width: 40, textAlign: 'right', color, fontVariantNumeric: 'tabular-nums' }}>{v}%</span>
    </div>
  );
}

function StatRow({ label, home, away, inverted = false }) {
  const h = home ?? 0;
  const a = away ?? 0;
  const hBetter = inverted ? h < a : h > a;
  const aBetter = inverted ? a < h : a > h;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        fontSize: 13, fontWeight: hBetter ? 700 : 400, width: 48, textAlign: 'right',
        color: hBetter ? 'var(--accent)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
      }}>{typeof h === 'number' && h % 1 !== 0 ? h.toFixed(2) : h}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, textAlign: 'center' }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: aBetter ? 700 : 400, width: 48, textAlign: 'left',
        color: aBetter ? 'var(--warning)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
      }}>{typeof a === 'number' && a % 1 !== 0 ? a.toFixed(2) : a}</span>
    </div>
  );
}
