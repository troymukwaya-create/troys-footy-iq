// ─── NATIONAL TEAM STRENGTH (World Cup engine) ──────────────────────
// National teams have no club-season stats, so the standard engine can't
// derive attack/defense from league standings. Instead we derive expected
// goals from World Football Elo ratings, handle NEUTRAL venues (only the
// 3 hosts — USA / Canada / Mexico — get a home edge), and feed the result
// straight into the Dixon-Coles Poisson core (generateProbabilities).
//
// The Elo table is a snapshot (source: eloratings.net, ~2026). Relative
// strength is what matters; values are refined as tournament results arrive.

import { generateProbabilities } from './poissonCore.js';
import { updateElo, expectedScore } from './eloLearning.js';
import { adjustExpectedGoals } from './matchContext.js';
import { getWcMarketWeight } from './marketWeight.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

// World Football Elo snapshot (eloratings.net, ~2026) — all 48 qualified
// nations + a few likely qualifiers. Anchored to real Elo where available,
// FIFA-rank-interpolated otherwise. Relative strength is what drives predictions.
const STRENGTH = {
  Spain: 2155, Argentina: 2113, France: 2062, England: 2020, Brazil: 1988,
  Portugal: 1984, Netherlands: 1944, Croatia: 1930, Germany: 1922, Morocco: 1900,
  Uruguay: 1892, Colombia: 1888, Switzerland: 1885, Senegal: 1879, Italy: 1872,
  Belgium: 1866, Mexico: 1840, USA: 1815, Japan: 1810, Ecuador: 1805,
  Denmark: 1790, Iran: 1780, Austria: 1772, Nigeria: 1768, 'South Korea': 1762,
  Egypt: 1755, Australia: 1748, Algeria: 1742, 'Ivory Coast': 1730, Norway: 1728,
  'Bosnia & Herzegovina': 1720, Paraguay: 1715, Canada: 1712, Sweden: 1705, Tunisia: 1690,
  Scotland: 1685, 'Czech Republic': 1680, Czechia: 1680, Cameroon: 1672, Panama: 1665,
  Qatar: 1640, 'South Africa': 1635, 'DR Congo': 1632, Uzbekistan: 1625, 'Saudi Arabia': 1612,
  Ghana: 1605, Iraq: 1585, Jordan: 1565, 'Cape Verde': 1545, 'Costa Rica': 1660,
  Curacao: 1490, Haiti: 1465, 'New Zealand': 1455,
  // Qualified but missing from the original snapshot (API-Football calls
  // them 'Türkiye' — resolved via accent folding + NAME_ALIASES below).
  // Without this entry Türkiye predicted off DEFAULT_ELO and the model
  // had Australia favoured over a Euro-2024 quarter-finalist.
  Turkey: 1885,
};

const DEFAULT_ELO    = 1640;   // unknown / weakest qualifiers
const WC_AVG_GOALS   = 1.35;   // goals per team per match (recent WCs ≈ 2.7 total)
const GOAL_SCALE     = 700;    // Elo→goals sensitivity (higher = flatter)
const HOST_ELO_BOOST = 60;     // host nations get a modest home edge
const HOST_ELO_BOOST_ALTITUDE = 85; // Mexico at altitude (Azteca 2240m, Guadalajara 1566m)
const ALTITUDE_VENUE_RE = /mexico city|ciudad de m|guadalajara|zapopan|monterrey|azteca|akron|bbva/i;
// Market blend weight is LEARNED daily from scored WC matches (marketWeight.js).
const HOSTS = new Set(['usa', 'united states', 'canada', 'mexico']);

// Different providers spell the same nation differently ('Türkiye'/'Turkey',
// 'Congo DR'/'DR Congo', 'Cape Verde Islands'/'Cape Verde', 'Curaçao'/
// 'Curacao'). Accent folding + canonical aliases make every variant resolve
// to one Elo entry — before this, unmatched names silently fell to
// DEFAULT_ELO and the prediction was garbage for that team.
const NAME_ALIASES = {
  turkiye: 'turkey',
  congodr: 'drcongo',
  capeverdeislands: 'capeverde',
  cotedivoire: 'ivorycoast',
  korearepublic: 'southkorea',
  unitedstates: 'usa',
  czechia: 'czechrepublic',
  bosniaandherzegovina: 'bosniaherzegovina',
};

export const norm = (s) => {
  const base = String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // fold accents: ü→u, ç→c
    .toLowerCase()
    .replace(/\b(fc|national team|the)\b/g, '')
    .replace(/[^a-z]/g, '')
    .trim();
  return NAME_ALIASES[base] || base;
};

const STRENGTH_NORM = {};
for (const [k, v] of Object.entries(STRENGTH)) STRENGTH_NORM[norm(k)] = v;

// Learned Elo overrides — populated from the national_elo table as qualifier /
// friendly results arrive. A team that's been winning this week outranks its
// static snapshot. Loaded at startup via loadPersistedElo().
const ELO_OVERRIDES = new Map(); // norm(name) -> elo

export function getElo(name) {
  const n = norm(name);
  if (!n) return DEFAULT_ELO;
  if (ELO_OVERRIDES.has(n)) return ELO_OVERRIDES.get(n);   // learned value wins
  if (STRENGTH_NORM[n] != null) return STRENGTH_NORM[n];
  for (const [k, v] of Object.entries(STRENGTH_NORM)) {
    if (k && (k.includes(n) || n.includes(k))) return v;
  }
  return DEFAULT_ELO;
}

/** Drop all learned overrides (admin reset) — back to the static snapshot. */
export function resetEloOverrides() { ELO_OVERRIDES.clear(); }

/** Load learned Elo ratings from the DB into memory (call once at startup). */
export async function loadPersistedElo() {
  if (!isDbAvailable()) return 0;
  try {
    const r = await safeQuery('SELECT team_norm, elo FROM national_elo');
    let n = 0;
    for (const row of r?.rows || []) { ELO_OVERRIDES.set(row.team_norm, Number(row.elo)); n++; }
    if (n) console.log(`[nationalTeams] Loaded ${n} learned Elo ratings`);
    return n;
  } catch { return 0; }
}

/**
 * Learn from a finished international match — updates both teams' Elo and
 * persists it. This is how the engine "learns from the games going on right now"
 * (qualifiers & friendlies) to be sharper for the World Cup.
 */
export async function applyResult({ homeName, awayName, homeGoals, awayGoals, neutral = true, importance = 'qualifier' }) {
  if (homeGoals == null || awayGoals == null) return null;
  const hNorm = norm(homeName), aNorm = norm(awayName);
  const upd = updateElo(getElo(homeName), getElo(awayName), homeGoals, awayGoals, { neutral, importance });
  ELO_OVERRIDES.set(hNorm, upd.homeElo);
  ELO_OVERRIDES.set(aNorm, upd.awayElo);
  if (isDbAvailable()) {
    const sql = `INSERT INTO national_elo (team_norm, team_name, elo, played, last_updated)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (team_norm) DO UPDATE SET
        elo = EXCLUDED.elo, team_name = EXCLUDED.team_name,
        played = national_elo.played + 1, last_updated = NOW()`;
    await safeQuery(sql, [hNorm, homeName, upd.homeElo]).catch(() => {});
    await safeQuery(sql, [aNorm, awayName, upd.awayElo]).catch(() => {});
  }
  return { home: { name: homeName, elo: upd.homeElo }, away: { name: awayName, elo: upd.awayElo }, delta: upd.delta };
}

const isHost = (name) => HOSTS.has(String(name || '').toLowerCase().trim());

/**
 * Opponent-strength factor for a team's recent-form goals.
 * Raw goals-for over qualifiers are inflated by farming weak opposition
 * (most of the 48 qualified through seeded groups). Scale by the average
 * Elo of the opponents actually faced, relative to a WC-average opponent
 * (~1800): goals vs minnows count less, goals vs elite count more.
 */
function opponentStrengthFactor(formObj) {
  const opps = (formObj?.recentResults || [])
    .map(r => getElo(r.opponent))
    .filter(e => Number.isFinite(e));
  if (!opps.length) return 1;
  const avg = opps.reduce((a, b) => a + b, 0) / opps.length;
  return clamp(Math.pow(10, (avg - 1800) / 1200), 0.7, 1.3);
}

/**
 * Full pre-match prediction for a World Cup match, from national-team Elo.
 * Returns the same shape as the Poisson core, enriched with strength metadata.
 *
 * ctx extras (all optional): homeForm/awayForm, homeRestDays/awayRestDays,
 * homeAvailability/awayAvailability, venueCity, knockout.
 */
export function predictWorldCupMatch(homeName, awayName, marketProbs = null, ctx = {}) {
  const homeElo = getElo(homeName);
  const awayElo = getElo(awayName);
  // Neutral unless host nation. Mexico's edge at altitude venues is real
  // physiology (acclimatized squad at 1500-2240m), not just crowd — boost more.
  let homeAdv = isHost(homeName) ? HOST_ELO_BOOST : 0;
  if (homeAdv && norm(homeName) === 'mexico' && ALTITUDE_VENUE_RE.test(String(ctx.venueCity || ''))) {
    homeAdv = HOST_ELO_BOOST_ALTITUDE;
  }
  // Friendlies are NOT neutral — the listed home team hosts (England v
  // Costa Rica at Wembley). Standard Elo home field is 100; slightly
  // conservative here since pre-tournament friendlies rotate squads.
  if (!homeAdv && ctx.homeField) homeAdv = 85;
  const dr = (homeElo + homeAdv) - awayElo;

  let baseLh = clamp(WC_AVG_GOALS * Math.exp(dr / GOAL_SCALE), 0.25, 4.5);
  let baseLa = clamp(WC_AVG_GOALS * Math.exp(-dr / GOAL_SCALE), 0.25, 4.5);

  // Blend in REAL recent form (qualifiers/friendlies from the paid API): a
  // team's recent attack vs the opponent's recent defence, each adjusted by
  // the strength of opposition faced. Weight grows with sample size, capped
  // at 35% — Elo (opponent-adjusted by construction) stays the backbone.
  const hf = ctx.homeForm, af = ctx.awayForm;
  let formWeight = 0, matchesUsed = 0;
  if (hf?.played && af?.played && hf.avgGoalsFor != null && af.avgGoalsFor != null) {
    matchesUsed = Math.min(hf.played, af.played);
    const hOpp = opponentStrengthFactor(hf);
    const aOpp = opponentStrengthFactor(af);
    // Goals scored vs weak opposition discounted; goals conceded vs weak
    // opposition flag a worse defence than the raw number suggests.
    const hGF = Number(hf.avgGoalsFor) * hOpp, hGA = Number(hf.avgGoalsAgainst) / hOpp;
    const aGF = Number(af.avgGoalsFor) * aOpp, aGA = Number(af.avgGoalsAgainst) / aOpp;
    const formLh = (hGF + aGA) / 2;
    const formLa = (aGF + hGA) / 2;
    formWeight = Math.min(0.35, matchesUsed / 20);
    baseLh = clamp((1 - formWeight) * baseLh + formWeight * formLh, 0.25, 4.5);
    baseLa = clamp((1 - formWeight) * baseLa + formWeight * formLa, 0.25, 4.5);
  }

  // Fatigue / availability adjustments (no-op unless ctx supplies real data).
  const adj = adjustExpectedGoals(baseLh, baseLa, ctx);
  const lambdaHome = adj.lambdaHome;
  const lambdaAway = adj.lambdaAway;

  const result = generateProbabilities(lambdaHome, lambdaAway, -0.08);
  const modelProbs = { ...result.probabilities };

  // Blend the sharp market consensus (markets reliably beat ratings models
  // for internationals) and surface the model-vs-market value edge — the
  // core product feature. The weight is learned daily from scored matches.
  let probabilities = modelProbs;
  let valueEdges = null;
  const W = getWcMarketWeight();
  if (marketProbs && Number.isFinite(marketProbs.home)) {
    let h = (1 - W) * modelProbs.home + W * marketProbs.home;
    let d = (1 - W) * modelProbs.draw + W * marketProbs.draw;
    let a = (1 - W) * modelProbs.away + W * marketProbs.away;
    const s = (h + d + a) || 1;
    probabilities = { home: r1(h / s * 100), draw: r1(d / s * 100), away: r1(a / s * 100) };
    valueEdges = {
      home: r1(modelProbs.home - marketProbs.home),
      draw: r1(modelProbs.draw - marketProbs.draw),
      away: r1(modelProbs.away - marketProbs.away),
    };
  }

  const { home, draw, away } = probabilities;
  const bestPick = (home >= draw && home >= away) ? { name: `${homeName} win`, probability: home }
    : (away >= draw) ? { name: `${awayName} win`, probability: away }
    : { name: 'Draw', probability: draw };

  // Knockout: probability of ADVANCING. The 1X2 is the 90-minute market;
  // a drawn 90 goes to extra time + penalties, where the Elo edge still
  // counts but is shrunk hard toward a coin flip (pens are near-random).
  let advance = null;
  if (ctx.knockout) {
    const exp = expectedScore(homeElo + homeAdv, awayElo, true); // 0..1
    const pHomeInExtra = clamp(0.5 + (exp - 0.5) * 0.5, 0.35, 0.65);
    advance = {
      home: r1(home + draw * pHomeInExtra),
      away: r1(away + draw * (1 - pHomeInExtra)),
    };
  }

  return {
    ...result,
    probabilities,
    model: marketProbs ? 'wc-elo-market-v1' : 'wc-elo-dixon-coles-v1',
    bestPick,
    modelProbs,
    marketProbs: marketProbs || null,
    valueEdges,
    advance,
    marketWeight: marketProbs ? W : null,
    nationalStrength: {
      homeElo, awayElo,
      neutral: homeAdv === 0,
      lambdaHome: round(lambdaHome),
      lambdaAway: round(lambdaAway),
      learned: ELO_OVERRIDES.has(norm(homeName)) || ELO_OVERRIDES.has(norm(awayName)),
      recentMatchesUsed: matchesUsed,
      formWeight: round(formWeight),
    },
    contextFactors: adj.applied ? adj.factors : null,
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v) { return Math.round(v * 100) / 100; }
function r1(v) { return parseFloat(Number(v).toFixed(1)); }

export default { getElo, predictWorldCupMatch, loadPersistedElo, applyResult, resetEloOverrides };
