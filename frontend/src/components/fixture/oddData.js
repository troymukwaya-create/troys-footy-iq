// ─── FIXTURE-CARD DATA HELPERS ──────────────────────────────────────
// Pure helpers for the re-imagined fixture cards, ported from the Claude
// Design "Fixture Cards" exploration (data.js). Outcome / verdict / brier
// mirror backend/engine/grading.js (22 / 13 thresholds) so a card never
// disagrees with the ledger or the settled receipt.

// 3-letter code for the diagonal-seam crest. National sides use their
// standard FIFA-ish code; everything else falls back to its first three
// letters — readable, and never a random palette glitch.
const NATION_CODE = {
  Brazil: 'BRA', Serbia: 'SRB', France: 'FRA', England: 'ENG', Spain: 'ESP',
  Morocco: 'MAR', Argentina: 'ARG', Netherlands: 'NED', Portugal: 'POR', Germany: 'GER',
  Mexico: 'MEX', Belgium: 'BEL', Croatia: 'CRO', Italy: 'ITA', Uruguay: 'URU',
  Colombia: 'COL', Switzerland: 'SUI', Denmark: 'DEN', Japan: 'JPN', USA: 'USA',
  'United States': 'USA', Senegal: 'SEN', Nigeria: 'NGA', Egypt: 'EGY', Ghana: 'GHA',
  'South Korea': 'KOR', 'Korea Republic': 'KOR', Iran: 'IRN', Australia: 'AUS',
  Canada: 'CAN', Ecuador: 'ECU', Qatar: 'QAT', 'Saudi Arabia': 'KSA', Poland: 'POL',
  Austria: 'AUT', Norway: 'NOR', Sweden: 'SWE', Scotland: 'SCO', Wales: 'WAL',
  'Czech Republic': 'CZE', Czechia: 'CZE', Turkey: 'TUR', 'Türkiye': 'TUR', Greece: 'GRE',
  'South Africa': 'RSA', Peru: 'PER', Chile: 'CHI', Paraguay: 'PAR', 'Ivory Coast': 'CIV',
  Uzbekistan: 'UZB', Jordan: 'JOR', Panama: 'PAN', 'Costa Rica': 'CRC',
};

export function teamCode(name) {
  if (!name) return '';
  if (NATION_CODE[name]) return NATION_CODE[name];
  const alpha = String(name).replace(/[^A-Za-z]/g, '');
  return (alpha || String(name)).slice(0, 3).toUpperCase();
}

// Normalise any probability to a 0-100 integer (inputs may be 0-1 or 0-100).
export function pct(v) {
  if (v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n <= 1 ? n * 100 : n);
}

// relative-luminance contrast pick for text over a nation colour
export function isLight(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) > 140000;
}

// model's predicted outcome from the probabilities (expects 0-100)
export function pickOutcome(p) {
  if (p.home >= p.draw && p.home >= p.away) return 'home';
  if (p.draw >= p.away) return 'draw';
  return 'away';
}

// actual outcome from a scoreline
export function resultOutcome(s) {
  if (s.home > s.away) return 'home';
  if (s.home < s.away) return 'away';
  return 'draw';
}

// Verdict tier comparing pick vs result — graded by the probability we gave
// the actual result, not a binary did-the-favourite-win (mirrors grading.js).
export function verdict(prob, score) {
  const pick = pickOutcome(prob);
  const actual = resultOutcome(score);
  const pa = prob[actual] || 0; // 0-100
  if (actual === pick) return { tier: 'ON_READ', label: 'Called it', sym: '✓', color: '#22C55E', bg: 'rgba(34,197,94,0.14)' };
  if (pa >= 22) return { tier: 'IN_RANGE', label: 'In range', sym: '≈', color: '#AAB2C0', bg: 'rgba(138,148,166,0.14)' };
  if (pa >= 13) return { tier: 'AGAINST', label: 'Against read', sym: '±', color: '#EAB308', bg: 'rgba(234,179,8,0.14)' };
  return { tier: 'MISSED', label: 'Missed', sym: '✕', color: '#EF4444', bg: 'rgba(239,68,68,0.14)' };
}

// Map the app's real fixture shape onto the design's state-view (`v`) that the
// VersusHero / ProbViz primitives consume. One adapter for every match surface.
export function fixtureView(fixture) {
  if (!fixture) return null;
  const status = fixture.status || 'SCHEDULED';
  const state = (status === 'IN_PLAY' || status === 'PAUSED') ? 'live'
    : (status === 'FINISHED' || status === 'FT' || status === 'AWARDED') ? 'settled' : 'upcoming';

  const p = fixture.probability?.probabilities;
  const prob = p ? { home: pct(p.home), draw: pct(p.draw), away: pct(p.away) } : null;

  const rs = fixture.score;
  const hasScore = rs && rs.home != null && rs.away != null;
  const score = (hasScore && (state === 'live' || state === 'settled')) ? { home: rs.home, away: rs.away } : null;

  const kickoff = fixture.date
    ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return {
    home: fixture.homeTeam?.name,
    away: fixture.awayTeam?.name,
    league: fixture.league?.name || '',
    stage: fixture.stage || fixture.league?.round || '',
    kickoff,
    state,
    prob,
    risk: (fixture.probability?.riskLevel || '').toUpperCase() || null,
    score,
    minute: fixture.minute,
    homeForm: fixture.homeTeam?.form || fixture.homeForm || null,
    awayForm: fixture.awayTeam?.form || fixture.awayForm || null,
    // Club badge URLs (API-Football) — used to fill the seam for non-nation
    // teams that have no flag; null for nations (they render their flag).
    homeCrest: fixture.homeTeam?.crest || null,
    awayCrest: fixture.awayTeam?.crest || null,
  };
}

// crude Brier-style number for the settled receipt (lower = better)
export function brier(prob, score) {
  const actual = resultOutcome(score);
  let sum = 0;
  for (const o of ['home', 'draw', 'away']) {
    const f = (prob[o] || 0) / 100;
    const y = o === actual ? 1 : 0;
    sum += (f - y) * (f - y);
  }
  return Math.round(sum * 1000) / 1000;
}

export default { teamCode, pct, isLight, pickOutcome, resultOutcome, verdict, brier, fixtureView };
