// ─── DATA NORMALIZATION LAYER ──────────────────────────────────────
// All API data passes through this layer before reaching routes or storage.
// This ensures consistent, predictable data shapes across the entire app.

/**
 * Normalize a fixture from any source into a consistent shape.
 * Handles null, undefined, and missing fields defensively.
 */
export function normalizeFixture(raw) {
  if (!raw) return null;

  return {
    id: raw.id || raw.fixture?.id || null,
    date: raw.date || raw.fixture?.date || null,
    league: {
      name: raw.league?.name || 'Unknown',
      code: raw.league?.code || '',
      country: raw.league?.country || '',
      logo: raw.league?.logo || null,
      round: raw.league?.round || raw.matchday || null,
      season: raw.league?.season || null,
    },
    status: raw.status || 'SCHEDULED',
    minute: raw.minute ?? null,
    venue: raw.venue || '',
    referee: raw.referee || null,
    homeTeam: {
      id: raw.homeTeam?.id || null,
      name: raw.homeTeam?.name || 'TBD',
      crest: raw.homeTeam?.crest || raw.homeTeam?.logo || null,
      goals: raw.score?.home ?? null,
    },
    awayTeam: {
      id: raw.awayTeam?.id || null,
      name: raw.awayTeam?.name || 'TBD',
      crest: raw.awayTeam?.crest || raw.awayTeam?.logo || null,
      goals: raw.score?.away ?? null,
    },
    score: {
      home: raw.score?.home ?? null,
      away: raw.score?.away ?? null,
    },
    halfTime: {
      home: raw.halfTime?.home ?? null,
      away: raw.halfTime?.away ?? null,
    },
    // Probability fields (injected later)
    probabilities: raw.probabilities || null,
    ai_risk: raw.ai_risk || null,
    ai_pick: raw.ai_pick || null,
    source: raw.source || 'unknown',
  };
}

/**
 * Normalize team statistics into a consistent shape.
 */
export function normalizeTeamStats(raw) {
  if (!raw) {
    return {
      avgGoalsFor: 1.35,
      avgGoalsAgainst: 1.15,
      cleanSheets: 0,
      form: 'N/A',
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      lastUpdated: null,
    };
  }

  const played = raw.played || raw.playedGames || raw.all?.played || 0;
  const goalsFor = raw.goals_for || raw.goalsFor || raw.all?.goals?.for || 0;
  const goalsAgainst = raw.goals_against || raw.goalsAgainst || raw.all?.goals?.against || 0;

  return {
    avgGoalsFor: played > 0 ? parseFloat((goalsFor / played).toFixed(2)) : 1.35,
    avgGoalsAgainst: played > 0 ? parseFloat((goalsAgainst / played).toFixed(2)) : 1.15,
    cleanSheets: raw.clean_sheets || raw.cleanSheets || 0,
    form: raw.form || 'N/A',
    played,
    wins: raw.wins || raw.won || raw.all?.win || 0,
    draws: raw.draws || raw.drawn || raw.all?.draw || 0,
    losses: raw.losses || raw.lost || raw.all?.lose || 0,
    goalsFor,
    goalsAgainst,
    lastUpdated: raw.last_updated || raw.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Normalize H2H data into a consistent shape.
 */
export function normalizeH2H(raw, homeTeamName, awayTeamName) {
  if (!raw || !Array.isArray(raw.matches || raw)) {
    return {
      totalMatches: 0,
      homeWins: 0,
      awayWins: 0,
      draws: 0,
      avgGoals: 0,
      matches: [],
    };
  }

  const matches = (raw.matches || raw).map(m => {
    const hName = m.homeTeam?.name || m.home || '';
    const aName = m.awayTeam?.name || m.away || '';
    const hGoals = m.score?.fullTime?.home ?? m.goals?.home ?? m.score?.home ?? null;
    const aGoals = m.score?.fullTime?.away ?? m.goals?.away ?? m.score?.away ?? null;

    let winner = 'Draw';
    if (hGoals !== null && aGoals !== null) {
      if (hGoals > aGoals) winner = hName;
      else if (aGoals > hGoals) winner = aName;
    } else if (m.score?.winner) {
      winner = m.score.winner === 'HOME_TEAM' ? hName
             : m.score.winner === 'AWAY_TEAM' ? aName
             : 'Draw';
    }

    return {
      date: m.utcDate || m.date || null,
      home: hName,
      away: aName,
      homeGoals: hGoals,
      awayGoals: aGoals,
      winner,
    };
  });

  const homeWins = matches.filter(m =>
    m.winner === homeTeamName || m.winner === m.home
  ).length;
  const awayWins = matches.filter(m =>
    m.winner === awayTeamName || m.winner === m.away
  ).length;
  const draws = matches.filter(m => m.winner === 'Draw').length;
  const totalGoals = matches.reduce((s, m) =>
    s + (m.homeGoals || 0) + (m.awayGoals || 0), 0
  );

  return {
    totalMatches: matches.length,
    homeWins,
    awayWins,
    draws,
    avgGoals: matches.length > 0 ? parseFloat((totalGoals / matches.length).toFixed(1)) : 0,
    matches: matches.slice(0, 10),
  };
}

/**
 * Create a safe, structured error response.
 */
export function errorResponse(message = 'An error occurred', details = null) {
  return {
    error: true,
    message,
    details: details || null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a safe structured response wrapper.
 */
export function successResponse(data, meta = {}) {
  return {
    error: false,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export default {
  normalizeFixture,
  normalizeTeamStats,
  normalizeH2H,
  errorResponse,
  successResponse,
};
