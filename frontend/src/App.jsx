import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFixtures, useLiveMatches, useAnalysis } from './hooks/useQueries.js';
import { useRealTime } from './hooks/useRealTime.js';
import { useStore } from './store/useStore.js';

// Components
import { TopNav } from './components/TopNav.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { LeagueSidebar } from './components/LeagueSidebar.jsx';
import { GoalFlash } from './components/GoalFlash.jsx';
import { AnalystDashboard } from './components/AnalystDashboard.jsx';
import { FixtureCard } from './components/FixtureCard.jsx';
import { MatchAnalysisPanel } from './components/MatchAnalysisPanel.jsx';
import { AIInsightsPanel } from './components/AIInsightsPanel.jsx';

export default function App() {
  useRealTime();

  const {
    selectedFixture, setSelectedFixture,
    activeLeague, setActiveLeague,
    goalFlashes,
  } = useStore();

  // ─── DATA FETCHING (React Query) ──────────────────────────────────
  const { data: fixturesData, isLoading: fixturesLoading, error: fixturesError } = useFixtures();
  const { data: liveMatches = [] } = useLiveMatches();

  const fixtures = useMemo(() => fixturesData?.fixtures || [], [fixturesData]);
  const dataSource = fixturesData?.source || 'loading';

  // Analysis for selected fixture
  const { data: analysis, isLoading: analysisLoading } = useAnalysis(selectedFixture?.id);

  // ─── LOCAL STATE ──────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState('leagues');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ─── FIXTURE FILTERING ────────────────────────────────────────────
  const allFixtures = useMemo(() => {
    const liveIds = new Set((liveMatches || []).map(l => l.id));
    const merged = [
      ...(liveMatches || []),
      ...fixtures.filter(f => !liveIds.has(f.id)),
    ];
    return merged;
  }, [fixtures, liveMatches]);

  const filteredFixtures = useMemo(() => {
    if (activeLeague === 'ALL') return allFixtures;
    if (activeLeague === 'LIVE') return allFixtures.filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED');
    if (activeLeague === 'TODAY') {
      const today = new Date().toDateString();
      return allFixtures.filter(f => new Date(f.date).toDateString() === today || f.status === 'IN_PLAY' || f.status === 'PAUSED');
    }
    if (activeLeague === 'TOMORROW') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      return allFixtures.filter(f => new Date(f.date).toDateString() === tom.toDateString());
    }
    return allFixtures.filter(f => f.league?.code === activeLeague);
  }, [allFixtures, activeLeague]);

  // ─── GROUP BY DATE ────────────────────────────────────────────────
  const groupedByDate = useMemo(() => {
    const byDate = {};
    filteredFixtures.forEach(f => {
      const key = f.date ? new Date(f.date).toDateString() : 'Unknown';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(f);
    });
    return Object.entries(byDate).sort(([a], [b]) => new Date(a) - new Date(b));
  }, [filteredFixtures]);

  // ─── HANDLERS ─────────────────────────────────────────────────────
  const handleSelectFixture = useCallback((fixture) => {
    if (!fixture?.id) return;
    setSelectedFixture(fixture);
  }, [setSelectedFixture]);

  const handleDeselectFixture = useCallback(() => {
    setSelectedFixture(null);
  }, [setSelectedFixture]);

  // ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === '?') setShowShortcuts(s => !s);
      if (e.key === 'Escape') {
        handleDeselectFixture();
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeselectFixture]);

  // ─── DATE LABEL HELPER ────────────────────────────────────────────
  const getDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    if (diff === -1) return 'YESTERDAY';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#080c16] text-[#e7eafb] font-body text-sm">
      <GoalFlash flashes={goalFlashes} />
      <TopNav
        onGoDashboard={handleDeselectFixture}
        fixtureSelected={!!selectedFixture}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT SIDEBAR — Leagues + Fixtures ═══ */}
        <aside className={`left-panel w-[280px] min-w-[280px] flex-shrink-0 flex flex-col h-full bg-[#0c1020] border-r border-white/[0.04] z-20 overflow-hidden`}>
          <LeagueSidebar
            fixtures={fixtures}
            liveMatches={liveMatches}
            activeLeague={activeLeague}
            onSelectLeague={(league) => {
              if (league?.code) {
                setActiveLeague(league.code);
              } else {
                setActiveLeague('ALL');
              }
            }}
            onGoDashboard={handleDeselectFixture}
          />

          {/* Fixture List */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {fixturesLoading && (
              <div className="py-10 text-center">
                <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
                <div className="text-xs text-white/40">Loading fixtures...</div>
              </div>
            )}

            {fixturesError && (
              <div className="py-10 text-center text-red-400/70">
                <div className="text-xl mb-2">⚠️</div>
                <div className="text-xs">Failed to load fixtures</div>
                <div className="text-[10px] text-white/30 mt-1">Check backend at localhost:3001</div>
              </div>
            )}

            {!fixturesLoading && !fixturesError && filteredFixtures.length === 0 && (
              <div className="py-10 text-center text-white/40">
                <div className="text-2xl mb-2">📅</div>
                <div className="text-xs font-semibold mb-1">No fixtures found</div>
                <div className="text-[10px] text-white/30">
                  {activeLeague !== 'ALL'
                    ? `No matches for ${activeLeague} — try "All"`
                    : 'Check backend is running'}
                </div>
              </div>
            )}

            {groupedByDate.map(([dateStr, dayFixtures]) => {
              const label = getDateLabel(dateStr);
              const liveCount = dayFixtures.filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;

              return (
                <div key={dateStr} className="mb-3 animate-fade-in">
                  <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5">
                    <span className={`text-[10px] font-black tracking-widest ${label === 'TODAY' ? 'text-cyan-400' : 'text-white/40'}`}>
                      {label}
                    </span>
                    {liveCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {liveCount} LIVE
                      </span>
                    )}
                    <span className="text-[10px] text-white/20 ml-auto">{dayFixtures.length}</span>
                  </div>

                  {dayFixtures.map(f => (
                    <FixtureCard
                      key={f.id}
                      fixture={f}
                      isSelected={selectedFixture?.id === f.id}
                      onClick={() => handleSelectFixture(f)}
                    />
                  ))}
                </div>
              );
            })}

            {/* Data Source Indicator */}
            {!fixturesLoading && fixtures.length > 0 && (
              <div className="text-[9px] text-white/15 px-2 py-3 text-center">
                {fixtures.length} fixtures · {dataSource}
              </div>
            )}
          </div>
        </aside>

        {/* ═══ CENTER PANEL — Match Analysis / Dashboard ═══ */}
        <main className="center-panel flex-1 overflow-y-auto bg-[#080c16] relative">
          {/* Background accent blur */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/[0.03] rounded-full blur-[120px] -translate-y-1/2 pointer-events-none" />

          <div className="relative z-10">
            {selectedFixture ? (
              <MatchAnalysisPanel
                fixture={selectedFixture}
                analysis={analysis}
                isLoading={analysisLoading}
              />
            ) : (
              <AnalystDashboard
                fixtures={filteredFixtures}
                onSelect={handleSelectFixture}
              />
            )}
          </div>
        </main>

        {/* ═══ RIGHT PANEL — AI Analysis & Insights ═══ */}
        <aside className="right-panel w-[320px] min-w-[320px] flex-shrink-0 flex flex-col bg-[#0c1020] border-l border-white/[0.04] overflow-hidden">
          <AIInsightsPanel
            fixture={selectedFixture}
            analysis={analysis}
            isLoading={analysisLoading}
          />
        </aside>
      </div>

      <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />

      {/* Footer */}
      <div className="px-4 py-2.5 bg-[#080c16] border-t border-white/[0.04] text-[9px] text-white/20 text-center z-10">
        Troy's Footy IQ — For analytical and educational purposes only. Not financial advice.
      </div>

      {/* Keyboard Shortcuts */}
      <div
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-14 right-4 bg-white/[0.04] border border-white/[0.06] text-white/30 text-[10px] px-2 py-1 rounded-md cursor-pointer z-10 hover:bg-white/[0.06] transition-all hidden md:block"
      >
        Press <span className="text-cyan-400/60 font-bold">?</span> for shortcuts
      </div>

      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center backdrop-blur-sm">
          <div onClick={e => e.stopPropagation()} className="glass-panel-solid p-6 rounded-2xl w-80 shadow-2xl">
            <h3 className="mb-4 text-cyan-400 font-headline font-bold text-lg">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-[auto_1fr] gap-3 text-sm">
              <kbd className="bg-white/[0.06] px-2 py-1 rounded text-xs font-mono">Esc</kbd>
              <span className="text-white/50">Deselect fixture</span>
              <kbd className="bg-white/[0.06] px-2 py-1 rounded text-xs font-mono">?</kbd>
              <span className="text-white/50">Toggle shortcuts</span>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Overrides */}
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
