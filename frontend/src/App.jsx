import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFixtures, useLiveMatches, useAnalysis } from './hooks/useQueries.js';
import { useRealTime } from './hooks/useRealTime.js';
import { useStore } from './store/useStore.js';

import { TopNav } from './components/TopNav.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { LeagueSidebar } from './components/LeagueSidebar.jsx';
import { GoalFlash } from './components/GoalFlash.jsx';
import { AnalystDashboard } from './components/AnalystDashboard.jsx';
import { FixtureCard } from './components/FixtureCard.jsx';
import { MatchAnalysisPanel } from './components/MatchAnalysisPanel.jsx';
import { AIInsightsPanel } from './components/AIInsightsPanel.jsx';
import { ParlayBuilderPanel } from './components/ParlayBuilderPanel.jsx';

export default function App() {
  useRealTime();

  const {
    selectedFixture, setSelectedFixture,
    activeLeague, setActiveLeague,
    goalFlashes,
  } = useStore();

  const { data: fixturesData, isLoading: fixturesLoading, error: fixturesError } = useFixtures();
  const { data: liveMatches = [] } = useLiveMatches();
  const fixtures = useMemo(() => fixturesData?.fixtures || [], [fixturesData]);
  const dataSource = fixturesData?.source || 'loading';
  const { data: analysis, isLoading: analysisLoading } = useAnalysis(selectedFixture?.id);

  const [mobileTab, setMobileTab] = useState('leagues');

  // ─── Fixture filtering ─────────────────────────────────────────
  const allFixtures = useMemo(() => {
    const liveIds = new Set((liveMatches || []).map(l => l.id));
    return [...(liveMatches || []), ...fixtures.filter(f => !liveIds.has(f.id))];
  }, [fixtures, liveMatches]);

  const filteredFixtures = useMemo(() => {
    if (activeLeague === 'ALL') return allFixtures;
    if (activeLeague === 'LIVE') return allFixtures.filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED');
    if (activeLeague === 'TODAY') {
      const today = new Date().toDateString();
      return allFixtures.filter(f => new Date(f.date).toDateString() === today || f.status === 'IN_PLAY' || f.status === 'PAUSED');
    }
    if (activeLeague === 'TOMORROW') {
      const tom = new Date(); tom.setDate(tom.getDate() + 1);
      return allFixtures.filter(f => new Date(f.date).toDateString() === tom.toDateString());
    }
    return allFixtures.filter(f => f.league?.code === activeLeague);
  }, [allFixtures, activeLeague]);

  // ─── Group by date ────────────────────────────────────────────
  const groupedByDate = useMemo(() => {
    const byDate = {};
    filteredFixtures.forEach(f => {
      const key = f.date ? new Date(f.date).toDateString() : 'Unknown';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(f);
    });
    return Object.entries(byDate).sort(([a], [b]) => new Date(a) - new Date(b));
  }, [filteredFixtures]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSelectFixture = useCallback((fixture) => {
    if (!fixture?.id) return;
    setSelectedFixture(fixture);
  }, [setSelectedFixture]);

  const handleDeselectFixture = useCallback(() => {
    setSelectedFixture(null);
  }, [setSelectedFixture]);

  // ─── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') handleDeselectFixture();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeselectFixture]);

  const getDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '14px' }}>
      <GoalFlash flashes={goalFlashes} />
      <TopNav onGoDashboard={handleDeselectFixture} fixtureSelected={!!selectedFixture} />

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT SIDEBAR ═══ */}
        <aside className="left-panel flex flex-col h-full" style={{ width: 280, minWidth: 280, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }}>
          <LeagueSidebar
            fixtures={fixtures}
            liveMatches={liveMatches}
            activeLeague={activeLeague}
            onSelectLeague={(league) => league?.code ? setActiveLeague(league.code) : setActiveLeague('ALL')}
            onGoDashboard={handleDeselectFixture}
          />

          {/* Fixture List */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '8px' }}>
            {fixturesLoading && (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div className="w-5 h-5 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading fixtures…</div>
              </div>
            )}

            {fixturesError && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--danger)' }}>
                <div style={{ fontSize: 12 }}>Failed to load fixtures</div>
              </div>
            )}

            {!fixturesLoading && !fixturesError && filteredFixtures.length === 0 && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>No fixtures found</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {activeLeague !== 'ALL' ? `No matches for ${activeLeague}` : 'Check backend is running'}
                </div>
              </div>
            )}

            {groupedByDate.map(([dateStr, dayFixtures]) => {
              const label = getDateLabel(dateStr);
              const liveCount = dayFixtures.filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;
              return (
                <div key={dateStr} className="animate-fade-in" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: label === 'Today' ? 'var(--accent)' : 'var(--text-tertiary)', letterSpacing: '0.02em' }}>
                      {label}
                    </span>
                    {liveCount > 0 && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--success-muted)', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} className="animate-pulse" />
                        {liveCount} Live
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{dayFixtures.length}</span>
                  </div>
                  {dayFixtures.map(f => (
                    <FixtureCard key={f.id} fixture={f} isSelected={selectedFixture?.id === f.id} onClick={() => handleSelectFixture(f)} />
                  ))}
                </div>
              );
            })}

            {!fixturesLoading && fixtures.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                {fixtures.length} fixtures · {dataSource}
              </div>
            )}
          </div>
        </aside>

        {/* ═══ CENTER PANEL ═══ */}
        <main className="center-panel flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {selectedFixture ? (
              <MatchAnalysisPanel fixture={selectedFixture} analysis={analysis} isLoading={analysisLoading} />
            ) : (
              <AnalystDashboard fixtures={filteredFixtures} onSelect={handleSelectFixture} />
            )}
          </div>
        </main>

        {/* ═══ RIGHT PANEL ═══ */}
        <aside className="right-panel flex flex-col" style={{ width: 320, minWidth: 320, flexShrink: 0, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', overflowY: 'auto' }}>
          <AIInsightsPanel fixture={selectedFixture} analysis={analysis} isLoading={analysisLoading} />
          <div style={{ padding: '0 12px 12px' }}>
            <ParlayBuilderPanel />
          </div>
        </aside>
      </div>

      <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />


      {/* Footer */}
      <div style={{ padding: '8px 16px', background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
        Troy's Footy IQ — For analytical and educational purposes only.
      </div>

      <style>{`
        @media (min-width: 769px) {
          .left-panel { display: flex !important; }
          .center-panel { display: flex !important; flex-direction: column; }
          .right-panel { display: flex !important; }
        }
        @media (max-width: 768px) {
          .left-panel { display: ${mobileTab === 'today' || mobileTab === 'leagues' ? 'flex' : 'none'} !important; width: 100% !important; min-width: 100% !important; border-right: none !important; padding-bottom: 60px; }
          .center-panel { display: ${mobileTab === 'match' ? 'flex' : 'none'} !important; width: 100% !important; padding-bottom: 60px; }
          .right-panel { display: ${mobileTab === 'ai' ? 'flex' : 'none'} !important; width: 100% !important; min-width: 100% !important; border-left: none !important; padding-bottom: 60px; }
        }
      `}</style>
    </div>
  );
}
