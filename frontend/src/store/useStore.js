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

  // Update a specific fixture's score in place (no full re-render)
  updateFixtureScore: (id, score, minute, status) => set(state => ({
    fixtures: state.fixtures.map(f => f.id === id ? { ...f, score, minute, status } : f),
    liveMatches: state.liveMatches.map(f => f.id === id ? { ...f, score, minute, status } : f),
  })),

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
}));
