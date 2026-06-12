import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams, Routes, Route, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useFixtures, useLiveMatches, useAnalysis, useAIAnalysisProgressive, api as queryApi } from './hooks/useQueries.js';
import { useRealTime } from './hooks/useRealTime.js';
import { useStore } from './store/useStore.js';
import { track } from './lib/analytics.js';
import { loadSlipFromUrl } from './lib/slipCodec.js';

import { TopNav } from './components/TopNav.jsx';
import OrbitMark from './components/OrbitMark.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { HonestBar } from './components/HonestBar.jsx';
import { LeagueSidebar } from './components/LeagueSidebar.jsx';
import { GoalFlash } from './components/GoalFlash.jsx';
import { AnalystDashboard } from './components/AnalystDashboard.jsx';
import { FixtureCard } from './components/FixtureCard.jsx';
import { SkeletonDashboard, SkeletonCard } from './components/ui/SkeletonLoader.jsx';
import { SuggestedSlips } from './components/SuggestedSlips.jsx';
import { EdgeExplainer } from './components/EdgeExplainer.jsx';
import { ComplianceFooter } from './components/ComplianceFooter.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { SavedSlipsModal } from './components/SavedSlipsModal.jsx';
import { useAuth } from './hooks/useAuth.js';
import { usePullToRefresh } from './hooks/usePullToRefresh.js';
import { RefreshCw } from 'lucide-react';

const MatchAnalysisPanel = React.lazy(() => import('./components/MatchAnalysisPanel.jsx').then(m => ({ default: m.MatchAnalysisPanel })));
const AIInsightsPanel = React.lazy(() => import('./components/AIInsightsPanel.jsx').then(m => ({ default: m.AIInsightsPanel })));
const ParlayBuilderPanel = React.lazy(() => import('./components/ParlayBuilderPanel.jsx').then(m => ({ default: m.ParlayBuilderPanel })));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard.jsx'));
const HowItWorks = React.lazy(() => import('./pages/HowItWorks.jsx'));
const LogoOptions = React.lazy(() => import('./pages/LogoOptions.jsx'));
const AuthVerify = React.lazy(() => import('./pages/AuthVerify.jsx'));

// Branded loader for lazy routes — matches the index.html boot splash so the
// transition is seamless and the screen is never blank.
function Splash() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#070708', gap: 14, zIndex: 9999 }}>
      <OrbitMark size={48} stroke={7} />
      <div className="font-display" style={{ fontSize: 18, fontWeight: 800 }}><span style={{ color: '#A8344A' }}>Odd</span><span style={{ color: '#cfd2da' }}>yessa</span></div>
      <div className="oddyessa-boot-spin" style={{ width: 22, height: 22, border: '2.5px solid rgba(255,255,255,0.12)', borderTopColor: '#A8344A', borderRadius: '50%' }} />
      <style>{`@keyframes oddyessaBootSpin{to{transform:rotate(360deg)}} .oddyessa-boot-spin{animation:oddyessaBootSpin .8s linear infinite}`}</style>
    </div>
  );
}

function MainApp() {
  useRealTime();

  const {
    selectedFixture, setSelectedFixture,
    activeLeague, setActiveLeague,
    goalFlashes,
    addParlaySelection, clearParlay,
  } = useStore();

  // Validate any stored session on load — keeps people signed in across visits.
  const initAuth = useAuth(s => s.init);
  useEffect(() => { initAuth(); }, [initAuth]);

  useEffect(() => {
    performance.mark('ttfr-start');
    return () => {
      performance.mark('ttfr-end');
      performance.measure('Time to First Render', 'ttfr-start', 'ttfr-end');
      const measure = performance.getEntriesByName('Time to First Render')[0];
      if (measure) {
        console.log(`[PERF] Time to First Render: ${measure.duration.toFixed(2)}ms`);
      }
    };
  }, []);

  const { data: fixturesData, isLoading: fixturesLoading, error: fixturesError } = useFixtures();
  const { data: liveMatches = [] } = useLiveMatches();
  const fixtures = useMemo(() => fixturesData?.fixtures || [], [fixturesData]);
  const dataSource = fixturesData?.source || 'loading';
  const dataMode = fixturesData?.mode || null;
  const { data: analysis, isLoading: analysisLoading } = useAnalysis(selectedFixture?.id);
  // AI loads progressively in parallel — model predictions render immediately,
  // AI section shows skeleton until this resolves (cache hit = instant)
  const { data: aiData, isLoading: aiLoading } = useAIAnalysisProgressive(
    selectedFixture?.id,
    !!analysis && analysis.dataQuality !== 'INSUFFICIENT'
  );

  // Merge AI into analysis object so child components see a unified shape
  const analysisWithAI = useMemo(() => {
    if (!analysis) return analysis;
    return { ...analysis, ai: aiData || analysis.ai };
  }, [analysis, aiData]);

  // Hover-prefetch: warm both caches before the user clicks
  const queryClient = useQueryClient();
  const prefetchAnalysis = useCallback((fixtureId) => {
    if (!fixtureId) return;
    queryClient.prefetchQuery({
      queryKey: ['analysis', fixtureId],
      queryFn: async () => {
        const { data } = await queryApi.get(`/analysis/${fixtureId}`);
        if (!data || data.error) throw new Error(data?.message || 'prefetch failed');
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ['ai-analysis', fixtureId],
      queryFn: async () => {
        const { data } = await queryApi.get(`/analysis/${fixtureId}/ai`, { timeout: 60000 });
        return data?.ai || null;
      },
      staleTime: 6 * 60 * 60 * 1000,
    });
  }, [queryClient]);

  // ─── Mobile tab routing via URL search params ─────────────────
  // Replaces CSS display-none toggling — now the browser back button works on mobile.
  const [searchParams, setSearchParams] = useSearchParams();
  const mobileTab = searchParams.get('tab') ?? 'home';

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

  // ─── Shared-slip deep links ───────────────────────────────────
  // ?slip=CODE (server short code) or #slip=od1.… (self-contained)
  // restores the sender's exact parlay in the builder. Seeds ONCE per
  // page load; on mobile it switches to the Edge tab so the loaded
  // slip is actually on screen.
  const slipSeeded = useRef(false);
  const [slipToast, setSlipToast] = useState(null);
  useEffect(() => {
    if (slipSeeded.current) return;
    const hasSlip = new URLSearchParams(window.location.search).get('slip') || window.location.hash.includes('slip=');
    if (!hasSlip) return;
    slipSeeded.current = true;
    loadSlipFromUrl().then(r => {
      if (!r?.legs?.length) return;
      clearParlay();
      r.legs.forEach(l => addParlaySelection(l));
      const odds = r.legs.reduce((p, l) => p * l.odds, 1);
      track('slip_link_opened', { legs: r.legs.length, source: r.source });
      setSearchParams(prev => ({ ...Object.fromEntries(prev), tab: 'ai' }), { replace: true });
      setSlipToast({ n: r.legs.length, odds });
      setTimeout(() => setSlipToast(null), 5000);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────
  // Match selection lives in the URL (?match=<id>): links to a specific
  // call are shareable, the browser back button closes the match, and a
  // refresh restores it. The store is synced FROM the URL below.
  const handleSelectFixture = useCallback((fixture) => {
    if (!fixture?.id) return;
    setSearchParams({ tab: 'home', match: String(fixture.id) });
    // CEO dashboard engagement signal
    track('prediction_viewed', {
      fixture_id: fixture.id,
      home_team: fixture.home?.name || fixture.homeTeam?.name || fixture.home_team,
      away_team: fixture.away?.name || fixture.awayTeam?.name || fixture.away_team,
      league_code: fixture.league?.code,
    });
  }, [setSearchParams]);

  const handleDeselectFixture = useCallback(() => {
    setSearchParams({ tab: 'home' }); // drop ?match= → feed shows
  }, [setSearchParams]);

  // Mobile bottom-nav handler — tapping "Home" clears any open match so the
  // best-bets feed shows (not a stale match analysis). Other tabs keep the
  // open match in the URL so returning to Home-with-back still works.
  const onMobileTab = useCallback((tab) => {
    setSearchParams(prev => {
      const match = prev.get('match');
      return tab !== 'home' && match ? { tab, match } : { tab };
    });
  }, [setSearchParams]);

  // URL → store sync. Re-runs as fixtures stream in, so a deep link selects
  // its match as soon as the feed contains it.
  useEffect(() => {
    const matchParam = searchParams.get('match');
    if (!matchParam) {
      if (selectedFixture) setSelectedFixture(null);
      return;
    }
    if (String(selectedFixture?.id) === matchParam) return;
    const f = allFixtures.find(x => String(x.id) === matchParam);
    if (f) setSelectedFixture(f);
  }, [searchParams, allFixtures, selectedFixture, setSelectedFixture]);

  // Pull-to-refresh (mobile) — re-fetch fixtures + live data on a downward pull
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);
  const ptr = usePullToRefresh(handleRefresh);

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

  // First-visit gate: new visitors pass through the cinematic intro once —
  // but NEVER when they followed a link to a specific match or a shared
  // slip. Someone who clicked a shared call must land on that call, and
  // someone who opened a friend's parlay must land on that parlay.
  const firstVisit = (() => { try { return !localStorage.getItem('oddyessa_welcomed'); } catch { return false; } })();
  // slipSeeded covers the re-render AFTER the loader consumed the #slip=
  // fragment from the URL — without it the gate fires once the URL is
  // cleaned and yanks the new visitor off their freshly loaded slip.
  const hasSlipLink = !!searchParams.get('slip') || window.location.hash.includes('slip=') || slipSeeded.current;
  if (firstVisit && !searchParams.get('match') && !hasSlipLink) return <Navigate to="/how-it-works" replace />;

  return (
    <div className="flex flex-col app-shell overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '14px' }}>
      <GoalFlash flashes={goalFlashes} />
      {slipToast && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 340, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: 'rgba(11,11,13,0.92)', border: '1px solid rgba(168,52,74,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          Slip loaded — {slipToast.n} leg{slipToast.n > 1 ? 's' : ''} @ {slipToast.odds.toFixed(2)}×
        </div>
      )}
      <AuthModal />
      <SavedSlipsModal />
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
            {dataMode === 'demo' && (
              <div id="demo-data-banner" style={{ margin: '0 4px 12px', padding: '10px 12px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: 11, color: '#F59E0B', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                <span><strong>Demo data</strong> — displaying sample predictions. Live predictions load once real fixtures are available.</span>
              </div>
            )}
            {fixturesLoading && (
              <div className="flex flex-col gap-2 p-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
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
                    <FixtureCard
                      key={f.id}
                      fixture={f}
                      isSelected={selectedFixture?.id === f.id}
                      onClick={() => handleSelectFixture(f)}
                      onMouseEnter={() => prefetchAnalysis(f.id)}
                    />
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
        <main ref={ptr.ref} className="center-panel flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
          {/* Pull-to-refresh indicator */}
          <div style={{ height: ptr.pull, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: (ptr.pull > 0 && !ptr.refreshing) ? 'none' : 'height 220ms ease' }}>
            <span className={ptr.refreshing ? 'animate-spin' : ''} style={{ opacity: Math.min(ptr.pull / 70, 1), display: 'flex' }}>
              <RefreshCw size={18} style={{ color: 'var(--accent)' }} />
            </span>
          </div>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {fixturesLoading ? (
              <SkeletonDashboard />
            ) : selectedFixture ? (
              <React.Suspense fallback={<SkeletonDashboard />}>
                <MatchAnalysisPanel fixture={selectedFixture} analysis={analysisWithAI} isLoading={analysisLoading} onBack={handleDeselectFixture} />
              </React.Suspense>
            ) : (
              <AnalystDashboard fixtures={filteredFixtures} onSelect={handleSelectFixture} activeLeague={activeLeague} />
            )}
            <ComplianceFooter />
          </div>
        </main>

        {/* ═══ RIGHT PANEL — "The Edge", told as ONE story:
             what the edge is → the ranked calls → ready-made slips →
             build your own. (Was three unconnected widgets.) ═══ */}
        <aside className="right-panel flex flex-col" style={{ width: 320, minWidth: 320, flexShrink: 0, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', overflowY: 'auto' }}>
          {!selectedFixture && <EdgeExplainer />}
          <React.Suspense fallback={<div className="p-4"><SkeletonCard /></div>}>
            <AIInsightsPanel fixture={selectedFixture} analysis={analysisWithAI} isLoading={analysisLoading || aiLoading} fixtures={filteredFixtures} onSelect={handleSelectFixture} />
          </React.Suspense>
          {!selectedFixture && <SuggestedSlips fixtures={filteredFixtures} />}
          <div style={{ padding: '0 12px 12px' }}>
            <React.Suspense fallback={<div className="p-4"><SkeletonCard /></div>}>
              <ParlayBuilderPanel />
            </React.Suspense>
          </div>
        </aside>
      </div>

      <MobileNav activeTab={mobileTab} onTabChange={onMobileTab} />
      <HonestBar />

      <style>{`
        @media (min-width: 769px) {
          .left-panel { display: flex !important; }
          .center-panel { display: flex !important; flex-direction: column; }
          .right-panel { display: flex !important; }
        }
        @media (max-width: 768px) {
          .left-panel { display: ${mobileTab === 'leagues' ? 'flex' : 'none'} !important; width: 100% !important; min-width: 100% !important; border-right: none !important; padding-bottom: calc(56px + env(safe-area-inset-bottom) + 8px); }
          .center-panel { display: ${mobileTab === 'home' || mobileTab === 'match' ? 'flex' : 'none'} !important; width: 100% !important; padding-bottom: calc(56px + env(safe-area-inset-bottom) + 8px); }
          .right-panel { display: ${mobileTab === 'ai' ? 'flex' : 'none'} !important; width: 100% !important; min-width: 100% !important; border-left: none !important; padding-bottom: calc(56px + env(safe-area-inset-bottom) + 8px); }
          .honest-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── ROOT ROUTER ──────────────────────────────────────────────────────
// The public app lives at "/*"; the CEO command center at "/admin".
export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={<React.Suspense fallback={<Splash />}><AdminDashboard /></React.Suspense>}
      />
      <Route
        path="/how-it-works"
        element={<React.Suspense fallback={<Splash />}><HowItWorks /></React.Suspense>}
      />
      <Route
        path="/logos"
        element={<React.Suspense fallback={<Splash />}><LogoOptions /></React.Suspense>}
      />
      <Route
        path="/auth"
        element={<React.Suspense fallback={<Splash />}><AuthVerify /></React.Suspense>}
      />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}
