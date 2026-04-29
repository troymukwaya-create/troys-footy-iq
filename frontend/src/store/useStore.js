import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Connection
  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Fixtures
  fixtures: [],
  setFixtures: (fixtures) => set({ fixtures }),
  liveMatches: [],
  setLiveMatches: (liveMatches) => set({ liveMatches }),

  // Update a specific fixture's live data in place
  updateFixtureScore: (id, score, minute, status, probability) => set(state => {
    const updateFn = f => {
      if (f.id !== id) return f;
      const updated = { ...f, score, minute, status };
      if (probability) updated.probability = probability;
      return updated;
    };
    return {
      fixtures: state.fixtures.map(updateFn),
      liveMatches: state.liveMatches.map(updateFn),
    };
  }),

  markMatchLive: (id) => set(state => ({
    fixtures: state.fixtures.map(f => f.id === id ? { ...f, status: 'IN_PLAY' } : f),
  })),

  markMatchFinished: (match) => set(state => ({
    liveMatches: state.liveMatches.filter(f => f.id !== match.id),
    fixtures: state.fixtures.map(f => f.id === match.id ? { ...f, ...match } : f),
  })),

  // Goal flash notifications
  goalFlashes: [],
  addGoalFlash: (goal) => {
    set(state => ({ goalFlashes: [goal, ...state.goalFlashes.slice(0, 4)] }));
    // Auto-remove after 8 seconds
    setTimeout(() => {
      set(state => ({ goalFlashes: state.goalFlashes.filter(g => g !== goal) }));
    }, 8000);
  },

  // Per-fixture live stats (possession, shots, xG updating live)
  matchStats: {},
  updateMatchStats: (fixtureId, stats) => set(state => ({
    matchStats: { ...state.matchStats, [fixtureId]: stats }
  })),

  // Standings per league
  standings: {},
  updateStandings: (leagueCode, data) => set(state => ({
    standings: { ...state.standings, [leagueCode]: data }
  })),

  // Selected match for center panel
  selectedFixture: null,
  setSelectedFixture: (fixture) => set({ selectedFixture: fixture }),

  // AI analysis per fixture (cached)
  analyses: {},
  setAnalysis: (fixtureId, analysis) => set(state => ({
    analyses: { ...state.analyses, [fixtureId]: analysis }
  })),
  aiLoading: false,
  setAiLoading: (v) => set({ aiLoading: v }),

  // Active league tab
  activeLeague: 'ALL',
  setActiveLeague: (league) => set({ activeLeague: league }),

  // Odds format
  oddsFormat: 'decimal',
  setOddsFormat: (format) => set({ oddsFormat: format }),

  // ─── PARLAY BUILDER ─────────────────────────────────────────────
  parlaySelections: [],

  addParlaySelection: (selection) => set(state => {
    // Prevent duplicate: same fixture + same outcome
    const exists = state.parlaySelections.some(
      s => s.fixtureId === selection.fixtureId && s.outcome === selection.outcome && s.market === selection.market
    );
    if (exists) return state;
    // Only one selection per fixture per market
    const filtered = state.parlaySelections.filter(
      s => !(s.fixtureId === selection.fixtureId && s.market === selection.market)
    );
    return { parlaySelections: [...filtered, selection] };
  }),

  removeParlaySelection: (fixtureId, market) => set(state => ({
    parlaySelections: state.parlaySelections.filter(
      s => !(s.fixtureId === fixtureId && s.market === market)
    ),
  })),

  clearParlay: () => set({ parlaySelections: [] }),

  getParlayOdds: () => {
    const selections = get().parlaySelections;
    if (selections.length === 0) return { totalOdds: 0, impliedProb: 0, risk: 'N/A' };
    let totalOdds = 1;
    let combinedProb = 1;
    for (const s of selections) {
      const odd = parseFloat(s.odd) || 1;
      totalOdds *= odd;
      combinedProb *= (1 / odd);
    }
    const impliedProb = parseFloat((combinedProb * 100).toFixed(1));
    const risk = impliedProb > 40 ? 'LOW' : impliedProb > 20 ? 'MEDIUM' : impliedProb > 8 ? 'HIGH' : 'VERY HIGH';
    return {
      totalOdds: parseFloat(totalOdds.toFixed(2)),
      impliedProb,
      risk,
      count: selections.length,
    };
  },
}));
