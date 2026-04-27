// Used when API keys are not yet set or API is unavailable
const DEMO_FIXTURES = [
  {
    id: 'demo_1',
    homeTeam: { id: 'afc', name: 'Arsenal', crest: '' },
    awayTeam: { id: 'lfc', name: 'Liverpool', crest: '' },
    score: { home: null, away: null },
    minute: null,
    status: 'SCHEDULED',
    date: new Date().toISOString(),
    league: { name: 'Premier League', code: 'PL', country: 'England' },
    venue: 'Emirates Stadium',
    home_prob: 57, draw_prob: 18, away_prob: 25,
    source: 'demo'
  },
  {
    id: 'demo_2',
    homeTeam: { id: 'mcfc', name: 'Manchester City', crest: '' },
    awayTeam: { id: 'cfc', name: 'Chelsea', crest: '' },
    score: { home: 2, away: 1 },
    minute: 67,
    status: 'IN_PLAY',
    date: new Date().toISOString(),
    league: { name: 'Premier League', code: 'PL', country: 'England' },
    venue: 'Etihad Stadium',
    home_prob: 67, draw_prob: 14, away_prob: 19,
    source: 'demo'
  },
  {
    id: 'demo_3',
    homeTeam: { id: 'rma', name: 'Real Madrid', crest: '' },
    awayTeam: { id: 'bar', name: 'Barcelona', crest: '' },
    score: { home: null, away: null },
    minute: null,
    status: 'SCHEDULED',
    date: new Date(Date.now() + 86400000).toISOString(),
    league: { name: 'La Liga', code: 'PD', country: 'Spain' },
    venue: 'Bernabeu',
    home_prob: 45, draw_prob: 25, away_prob: 30,
    source: 'demo'
  },
  {
    id: 'demo_4',
    homeTeam: { id: 'bay', name: 'Bayern Munich', crest: '' },
    awayTeam: { id: 'bvb', name: 'Borussia Dortmund', crest: '' },
    score: { home: null, away: null },
    minute: null,
    status: 'SCHEDULED',
    date: new Date(Date.now() + 86400000).toISOString(),
    league: { name: 'Bundesliga', code: 'BL1', country: 'Germany' },
    venue: 'Allianz Arena',
    home_prob: 55, draw_prob: 20, away_prob: 25,
    source: 'demo'
  },
  {
    id: 'demo_5',
    homeTeam: { id: 'juve', name: 'Juventus', crest: '' },
    awayTeam: { id: 'inter', name: 'Inter Milan', crest: '' },
    score: { home: null, away: null },
    minute: null,
    status: 'SCHEDULED',
    date: new Date(Date.now() + 172800000).toISOString(),
    league: { name: 'Serie A', code: 'SA', country: 'Italy' },
    venue: 'Allianz Stadium',
    home_prob: 40, draw_prob: 28, away_prob: 32,
    source: 'demo'
  },
  {
    id: 'demo_6',
    homeTeam: { id: 'flam', name: 'Flamengo', crest: '' },
    awayTeam: { id: 'palm', name: 'Palmeiras', crest: '' },
    score: { home: null, away: null },
    minute: null,
    status: 'SCHEDULED',
    date: new Date(Date.now() + 172800000).toISOString(),
    league: { name: 'Brasileirao', code: 'BSA', country: 'Brazil' },
    venue: 'Maracana',
    home_prob: 48, draw_prob: 22, away_prob: 30,
    source: 'demo'
  },
];

const DEMO_STANDINGS = {
  PL: [
    { rank: 1, team: { id: 'lfc', name: 'Liverpool' }, played: 28, won: 20, drawn: 5, lost: 3, goalsFor: 65, goalsAgainst: 28, goalDiff: 37, points: 65, form: 'WWWDW' },
    { rank: 2, team: { id: 'afc', name: 'Arsenal' }, played: 28, won: 18, drawn: 6, lost: 4, goalsFor: 58, goalsAgainst: 30, goalDiff: 28, points: 60, form: 'WWDWW' },
    { rank: 3, team: { id: 'mcfc', name: 'Manchester City' }, played: 28, won: 16, drawn: 5, lost: 7, goalsFor: 55, goalsAgainst: 38, goalDiff: 17, points: 53, form: 'WLWWW' },
    { rank: 4, team: { id: 'cfc', name: 'Chelsea' }, played: 28, won: 15, drawn: 4, lost: 9, goalsFor: 52, goalsAgainst: 40, goalDiff: 12, points: 49, form: 'DWWLW' },
    { rank: 5, team: { id: 'thfc', name: 'Tottenham' }, played: 28, won: 14, drawn: 4, lost: 10, goalsFor: 50, goalsAgainst: 44, goalDiff: 6, points: 46, form: 'WDLWL' },
  ]
};

const DEMO_H2H = {
  matches: [
    { date: '2024-04-14', homeTeam: 'Arsenal', awayTeam: 'Liverpool', score: '2-2', winner: 'draw' },
    { date: '2023-12-23', homeTeam: 'Liverpool', awayTeam: 'Arsenal', score: '1-1', winner: 'draw' },
    { date: '2023-04-09', homeTeam: 'Arsenal', awayTeam: 'Liverpool', score: '2-2', winner: 'draw' },
    { date: '2022-10-09', homeTeam: 'Arsenal', awayTeam: 'Liverpool', score: '3-2', winner: 'Arsenal' },
    { date: '2022-01-13', homeTeam: 'Liverpool', awayTeam: 'Arsenal', score: '4-0', winner: 'Liverpool' },
  ],
  summary: { homeWins: 2, draws: 2, awayWins: 3, avgGoals: 2.8, bttsRate: 71, over25Rate: 57 }
};

function getDemoPlayerStats(fixtureId) {
  return {
    home: {
      team: 'Arsenal',
      starters: [
        { name: 'Raya',      position: 'GK', minutes: 90, goals: 0, assists: 0, rating: 7.2, shots: 0,  passes: 43, passAcc: 91, events: [] },
        { name: 'White',     position: 'RB', minutes: 90, goals: 0, assists: 1, rating: 7.8, shots: 1,  passes: 67, passAcc: 88, events: ['assist'] },
        { name: 'Saliba',    position: 'CB', minutes: 90, goals: 0, assists: 0, rating: 8.1, shots: 0,  passes: 82, passAcc: 94, events: [] },
        { name: 'Magalhaes', position: 'CB', minutes: 90, goals: 0, assists: 0, rating: 7.6, shots: 0,  passes: 79, passAcc: 92, events: [] },
        { name: 'Timber',    position: 'LB', minutes: 74, goals: 0, assists: 0, rating: 6.9, shots: 2,  passes: 55, passAcc: 85, events: ['subOff:74'] },
        { name: 'Partey',    position: 'CM', minutes: 90, goals: 0, assists: 0, rating: 7.4, shots: 1,  passes: 88, passAcc: 91, events: [] },
        { name: 'Odegaard',  position: 'CM', minutes: 90, goals: 1, assists: 0, rating: 8.6, shots: 4,  passes: 72, passAcc: 89, events: ['goal:38'] },
        { name: 'Rice',      position: 'CM', minutes: 90, goals: 0, assists: 0, rating: 7.9, shots: 2,  passes: 95, passAcc: 93, events: [] },
        { name: 'Saka',      position: 'RW', minutes: 90, goals: 1, assists: 1, rating: 9.1, shots: 5,  passes: 48, passAcc: 82, events: ['goal:67','yellow'] },
        { name: 'Havertz',   position: 'ST', minutes: 83, goals: 0, assists: 0, rating: 6.8, shots: 3,  passes: 31, passAcc: 77, events: ['subOff:83'] },
        { name: 'Martinelli',position: 'LW', minutes: 90, goals: 0, assists: 0, rating: 7.3, shots: 3,  passes: 44, passAcc: 80, events: [] },
      ],
      subs: [
        { name: 'Zinchenko', position: 'LB', minutes: 16, goals: 0, assists: 0, rating: 7.1, shots: 0, passes: 22, passAcc: 86, events: ['subOn:74'] },
        { name: 'Nwaneri',   position: 'AM', minutes: 7,  goals: 0, assists: 0, rating: 6.5, shots: 0, passes: 8,  passAcc: 75, events: ['subOn:83'] },
      ]
    },
    away: {
      team: 'Liverpool',
      starters: [
        { name: 'Alisson',   position: 'GK', minutes: 90, goals: 0, assists: 0, rating: 7.0, shots: 0, passes: 38, passAcc: 89, events: [] },
        { name: 'Alexander-Arnold', position: 'RB', minutes: 90, goals: 0, assists: 1, rating: 8.0, shots: 2, passes: 78, passAcc: 91, events: ['assist'] },
        { name: 'Konate',    position: 'CB', minutes: 90, goals: 0, assists: 0, rating: 7.2, shots: 0, passes: 74, passAcc: 90, events: [] },
        { name: 'Van Dijk',  position: 'CB', minutes: 90, goals: 0, assists: 0, rating: 7.5, shots: 1, passes: 81, passAcc: 93, events: [] },
        { name: 'Robertson', position: 'LB', minutes: 90, goals: 0, assists: 0, rating: 7.1, shots: 1, passes: 63, passAcc: 87, events: [] },
        { name: 'Gravenberch', position: 'CM', minutes: 90, goals: 0, assists: 0, rating: 7.8, shots: 1, passes: 91, passAcc: 92, events: [] },
        { name: 'Mac Allister', position: 'CM', minutes: 90, goals: 0, assists: 0, rating: 7.4, shots: 2, passes: 84, passAcc: 90, events: [] },
        { name: 'Szoboszlai', position: 'CM', minutes: 68, goals: 0, assists: 0, rating: 6.7, shots: 2, passes: 55, passAcc: 83, events: ['subOff:68'] },
        { name: 'Salah',     position: 'RW', minutes: 90, goals: 1, assists: 0, rating: 8.8, shots: 6, passes: 41, passAcc: 79, events: ['goal:51'] },
        { name: 'Nunez',     position: 'ST', minutes: 90, goals: 0, assists: 0, rating: 6.9, shots: 4, passes: 28, passAcc: 74, events: ['yellow'] },
        { name: 'Diaz',      position: 'LW', minutes: 90, goals: 0, assists: 0, rating: 7.6, shots: 3, passes: 46, passAcc: 81, events: [] },
      ],
      subs: [
        { name: 'Jones',     position: 'CM', minutes: 22, goals: 0, assists: 0, rating: 6.8, shots: 0, passes: 31, passAcc: 82, events: ['subOn:68'] },
      ]
    }
  };
}

export { DEMO_FIXTURES, DEMO_STANDINGS, DEMO_H2H, getDemoPlayerStats };
