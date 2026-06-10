import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { MarketsPanel } from './MarketsPanel.jsx';
import { ShareCallButton } from './ShareCallButton.jsx';
import { EmailCapture } from './EmailCapture.jsx';
import { MatchEvidence } from './MatchEvidence.jsx';
import { getVisibleTeamColor } from '../constants/teamColors.js';
import { flagGradient } from '../constants/nationColors.js';
import FlagBleed, { hasFlags } from './FlagBleed.jsx';

/**
 * MatchAnalysisPanel — Center panel for match analysis.
 * Clean, structured: header → tabs → content.
 */
export function MatchAnalysisPanel({ fixture, analysis, isLoading, onBack }) {
  const [activeTab, setActiveTab] = useState('analysis');

  if (!fixture) return null;

  const home = fixture?.homeTeam?.name || 'Home';
  const away = fixture?.awayTeam?.name || 'Away';
  const homeColor = getVisibleTeamColor(fixture?.homeTeam?.name);
  const awayColor = getVisibleTeamColor(fixture?.awayTeam?.name);
  const homeCrest = fixture?.homeTeam?.crest || null;
  const awayCrest = fixture?.awayTeam?.crest || null;
  const league = fixture?.league?.name || '';
  const status = fixture?.status || 'SCHEDULED';
  const isLive = status === 'IN_PLAY' || status === 'PAUSED';

  // ─── Data quality gate ─────────────────────────────────────
  const dataQuality = analysis?.dataQuality || null;
  const dataIssues = analysis?.dataIssues || [];
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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: 'clamp(12px, 4vw, 24px)' }}
    >
      {/* ─── Sticky compact header — back + match identity while scrolling ─── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', marginBottom: 8, background: hasFlags(home, away) ? 'rgba(11,11,13,0.82)' : flagGradient(home, away, 'rgba(11,11,13,0.82)', '26'), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 12, overflow: 'hidden', isolation: 'isolate' }}>
        {hasFlags(home, away) && <FlagBleed home={home} away={away} opacity={0.4} />}
        {onBack && (
          <button onClick={onBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
            <ChevronLeft size={18} />
          </button>
        )}
        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{home} v {away}</span>
        <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', flexShrink: 0 }}>{fixture?.score?.home ?? '–'}:{fixture?.score?.away ?? '–'}</span>
        <ShareCallButton fixture={fixture} prob={prob} />
      </div>

      {/* ─── Match Header — each team's REAL flag bleeding across, like the home cards ─── */}
      <div className="card" style={{ padding: 24, marginBottom: 16, background: hasFlags(home, away) ? 'var(--bg-surface)' : flagGradient(home, away, 'var(--bg-surface)'), border: '1px solid var(--border-subtle)', position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
        {hasFlags(home, away) && <FlagBleed home={home} away={away} opacity={0.7} />}
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
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: homeColor }}>{home}</span>
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
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: awayColor }}>{away}</span>
            {awayStats?.form && awayStats.form !== 'N/A' && <FormStrip form={awayStats.form} />}
          </div>
        </div>

        {/* Win Probability Bar — only show with valid data */}
        {prob && dataQuality !== 'INSUFFICIENT' && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: homeColor }}>{prob.probabilities?.home || 0}%</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{prob.probabilities?.draw || 0}%</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: awayColor }}>{prob.probabilities?.away || 0}%</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${prob.probabilities?.home || 33}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ background: homeColor, borderRadius: '4px 0 0 4px' }} />
              <motion.div initial={{ width: 0 }} animate={{ width: `${prob.probabilities?.draw || 33}%` }} transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }} style={{ background: 'rgba(255,255,255,0.12)' }} />
              <motion.div initial={{ width: 0 }} animate={{ width: `${prob.probabilities?.away || 33}%` }} transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} style={{ background: awayColor, borderRadius: '0 4px 4px 0' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{home}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Draw</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{away}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Data Quality Banners ─────────────────────────── */}
      {dataQuality === 'PARTIAL' && (
        <div style={{
          padding: '10px 16px', borderRadius: 'var(--radius-md)', marginBottom: 12,
          background: 'var(--warning-muted)', border: '1px solid rgba(234,179,8,0.20)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>Partial Data</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {dataIssues.length > 0 ? dataIssues[0] : 'Some team statistics are unavailable. Predictions may be less accurate.'}
            </div>
          </div>
        </div>
      )}

      {dataQuality === 'INSUFFICIENT' && !isLoading && (
        <div style={{
          padding: '24px 16px', borderRadius: 'var(--radius-lg)', marginBottom: 12,
          background: 'var(--danger-muted)', border: '1px solid rgba(239,68,68,0.20)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Insufficient Data</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            Team statistics are not yet available for this fixture.
            Predictions cannot be generated without reliable data.
          </div>
          {dataIssues.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {dataIssues.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      )}

      {/* Live Stats — only render for live matches */}
      {!isLoading && isLive && analysis?.liveStats && (
        <div className="card animate-fade-in" style={{ padding: 16, marginTop: 12 }}>
          <div className="section-title" style={{ marginBottom: 16 }}>Live Match Statistics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.keys(analysis.liveStats[Object.keys(analysis.liveStats)[0]] || {}).map((statType, idx) => {
              const teamNames = Object.keys(analysis.liveStats);
              const hName = teamNames[0];
              const aName = teamNames[1];
              const hVal = analysis.liveStats[hName]?.[statType] ?? 0;
              const aVal = analysis.liveStats[aName]?.[statType] ?? 0;
              
              return (
                <StatRow 
                  key={idx} 
                  label={statType} 
                  home={hVal} 
                  away={aVal}
                  inverted={statType.toLowerCase().includes('fouls') || statType.toLowerCase().includes('cards') || statType.toLowerCase().includes('offsides')}
                />
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && isLive && !analysis?.liveStats && (
        <div className="card animate-fade-in" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Live Match Stats</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Real-time tracking is currently unavailable for this fixture.
          </div>
        </div>
      )}

      {/* Tabs — always show when not loading */}
      {!isLoading && (
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
              {prob ? (
                <>
                  {prob.reasoning && <WhyPanel reasoning={prob.reasoning} homeColor={homeColor} awayColor={awayColor} />}

                  {/* The proof behind the bullets — model vs market, Elo,
                      form, H2H, blend disclosure. The persuasion layer. */}
                  <MatchEvidence
                    prob={prob}
                    h2h={h2h}
                    home={home}
                    away={away}
                    homeColor={homeColor}
                    awayColor={awayColor}
                    homeStats={homeStats}
                    awayStats={awayStats}
                  />
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
                </>
              ) : analysis?.status === 'FINISHED' ? (
                <div className="card" style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Match Completed</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>
                    {analysis.result?.home ?? '?'} — {analysis.result?.away ?? '?'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Final score · Predictions are not available for finished matches
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                    Analysis unavailable
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {dataQuality === 'INSUFFICIENT' ? 'Insufficient data for predictions.' : 'Check back closer to kick-off.'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="card animate-fade-in" style={{ padding: 16 }}>
              {homeStats || awayStats ? (
                <>
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
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  Team statistics are not available for this fixture.
                </div>
              )}
              {prob?.intelligence && <RecentForm intel={prob.intelligence} home={home} away={away} />}
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
              <MarketsPanel fixture={fixture} />
            </div>
          )}
        </>
      )}

      {/* ── Email capture — the reader just consumed a full analysis;
            this is the moment they're most likely to want tomorrow's. ── */}
      {!isLoading && (
        <div style={{ marginTop: 20, padding: 'clamp(16px, 4vw, 24px)', borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <EmailCapture
            source="match"
            headline="Want the next call before kickoff?"
            sub="The day’s best value picks in your inbox every World Cup morning — who wins, why, and where the bookies are wrong."
            hideIfSubscribed
          />
        </div>
      )}
    </motion.div>
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

function RecentForm({ intel, home, away }) {
  const Team = ({ name, data }) => {
    if (!data?.recentResults?.length) return null;
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          {name} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>
            · last {data.played}: {data.wins}W-{data.draws}D-{data.losses}L · {data.cleanSheets} clean sheets
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.recentResults.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                background: r.result === 'W' ? 'var(--success-muted)' : r.result === 'D' ? 'var(--warning-muted)' : 'var(--danger-muted)',
                color: r.result === 'W' ? 'var(--success)' : r.result === 'D' ? 'var(--warning)' : 'var(--danger)' }}>{r.result}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', width: 36 }}>{r.score}</span>
              <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>v {r.opponent}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{(r.competition || '').replace('World Cup - Qualification ', 'WCQ · ')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  if (!intel?.home?.recentResults?.length && !intel?.away?.recentResults?.length) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
      <div className="section-title" style={{ marginBottom: 4 }}>Recent Form · all competitions</div>
      <Team name={home} data={intel.home} />
      <Team name={away} data={intel.away} />
    </div>
  );
}

function WhyPanel({ reasoning, homeColor, awayColor }) {
  if (!reasoning || !reasoning.reasons?.length) return null;
  const dot = (favors) => favors === 'home' ? homeColor : favors === 'away' ? awayColor : 'var(--text-muted)';
  return (
    <div className="card" style={{ padding: 18, border: '1px solid var(--accent-muted)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, color: 'var(--text-primary)' }}>
        {reasoning.headline}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reasoning.reasons.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot(r.favors), marginTop: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.text}</span>
          </div>
        ))}
      </div>
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
              background: `rgba(168,52,74, ${0.04 + intensity * 0.12})`,
              border: `1px solid rgba(168,52,74, ${0.08 + intensity * 0.15})`,
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
        <motion.div className="prob-bar-fill" initial={{ width: 0 }} whileInView={{ width: `${Math.min(v, 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: color }} />
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
