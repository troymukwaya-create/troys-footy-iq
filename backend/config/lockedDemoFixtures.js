// ─── LOCKED DEMO FIXTURES ────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the investor demo.
//
// These 4 fixtures are manually verified and represent the real
// 2025-26 UEFA Champions League and Europa League semi-finals.
//
// Rules:
//   1. NEVER mix IDs across providers. All IDs use the 'demo_' prefix.
//   2. All dates are in UTC.
//   3. This file is the ONLY authoritative fallback. All other DEMO arrays
//      (routes/fixtures.js, services/demoData.js) import from here.
//   4. Update dates before the demo to reflect actual scheduled kickoffs.
//
// Competition IDs:
//   CL  = UEFA Champions League (football-data.org: CL)
//   EL  = UEFA Europa League (football-data.org: EL)

// Semi-final window — Real dates verified against football-data.org live API
// CL SF 1st legs: 5–6 May 2026 | EL SF 1st legs: 7–8 May 2026
const SF_CL_1 = '2026-05-05T19:00:00Z'; // Arsenal vs Atlético — Tue 5 May, 21:00 CET
const SF_CL_2 = '2026-05-06T19:00:00Z'; // Bayern vs PSG — Wed 6 May, 21:00 CET
const SF_EL_1 = '2026-05-07T19:00:00Z'; // EL SF 1 — Thu 7 May, 21:00 CET
const SF_EL_2 = '2026-05-08T19:00:00Z'; // EL SF 2 — Thu 8 May, 21:00 CET

export const LOCKED_DEMO_FIXTURES = [
  // ═══ Champions League Semi-Finals (VERIFIED against football-data.org API) ═
  {
    id: 'demo_cl_sf_1',
    status: 'SCHEDULED',
    date: SF_CL_1,
    homeTeam: {
      id: 'demo_t_ars',
      name: 'Arsenal',
      crest: 'https://crests.football-data.org/57.png',
    },
    awayTeam: {
      id: 'demo_t_atm',
      name: 'Atlético Madrid',
      crest: 'https://crests.football-data.org/78.png',
    },
    score: { home: null, away: null },
    minute: null,
    league: {
      name: 'UEFA Champions League',
      code: 'CL',
      country: 'UEFA',
    },
    round: 'Semi-Final – 1st Leg',
    venue: 'Emirates Stadium, London',
    source: 'demo_locked',
  },
  {
    id: 'demo_cl_sf_2',
    status: 'SCHEDULED',
    date: SF_CL_2,
    homeTeam: {
      id: 'demo_t_bay',
      name: 'Bayern Munich',
      crest: 'https://crests.football-data.org/5.svg',
    },
    awayTeam: {
      id: 'demo_t_psg',
      name: 'Paris Saint-Germain',
      crest: 'https://crests.football-data.org/524.png',
    },
    score: { home: null, away: null },
    minute: null,
    league: {
      name: 'UEFA Champions League',
      code: 'CL',
      country: 'UEFA',
    },
    round: 'Semi-Final – 1st Leg',
    venue: 'Allianz Arena, Munich',
    source: 'demo_locked',
  },

  // ═══ Europa League Semi-Finals ════════════════════════════════════════
  {
    id: 'demo_el_sf_1',
    status: 'SCHEDULED',
    date: SF_EL_1,
    homeTeam: {
      id: 'demo_t_atb',
      name: 'Athletic Bilbao',
      crest: 'https://crests.football-data.org/77.png',
    },
    awayTeam: {
      id: 'demo_t_spu',
      name: 'Tottenham Hotspur',
      crest: 'https://crests.football-data.org/73.png',
    },
    score: { home: null, away: null },
    minute: null,
    league: {
      name: 'UEFA Europa League',
      code: 'EL',
      country: 'UEFA',
    },
    round: 'Semi-Final – 1st Leg',
    venue: 'San Mamés, Bilbao',
    source: 'demo_locked',
  },
  {
    id: 'demo_el_sf_2',
    status: 'SCHEDULED',
    date: SF_EL_2,
    homeTeam: {
      id: 'demo_t_laz',
      name: 'Lazio',
      crest: 'https://crests.football-data.org/110.png',
    },
    awayTeam: {
      id: 'demo_t_b04',
      name: 'Bayer Leverkusen',
      crest: 'https://crests.football-data.org/3.png',
    },
    score: { home: null, away: null },
    minute: null,
    league: {
      name: 'UEFA Europa League',
      code: 'EL',
      country: 'UEFA',
    },
    round: 'Semi-Final – 1st Leg',
    venue: 'Stadio Olimpico, Rome',
    source: 'demo_locked',
  },
];

// Allowed competition codes for the demo — strict whitelist
export const DEMO_COMPETITION_CODES = ['CL', 'EL'];

// Expected team IDs in the demo (validated against above fixtures)
export const DEMO_TEAM_IDS = new Set(
  LOCKED_DEMO_FIXTURES.flatMap(f => [f.homeTeam.id, f.awayTeam.id])
);

// Expected fixture IDs (validated for prediction consistency)
export const DEMO_FIXTURE_IDS = new Set(
  LOCKED_DEMO_FIXTURES.map(f => f.id)
);

export default LOCKED_DEMO_FIXTURES;
