// ─── THE TWO-NUMBER LEDGER (the company-defining experiment) ────────
// The published Brier is the BLENDED number (60% sharp market by default).
// Blending toward the market improves Brier precisely because the market is
// sharp — so the headline number partly belongs to Pinnacle, not to us. The
// cross-vendor council's verdict: until we know whether the PURE model adds
// signal over the market, the "sell the engine" (B2B / Act IV) story is
// unproven. This computes three Briers over our own scored World Cup matches
// — blended, pure-model, market-only — plus closing-line value, all from data
// the lock job already stores (features.modelProbs / features.marketProbs in
// each locked row; consensus snapshots in odds_history).
//
// Read it honestly: if pureModel ≈ marketOnly we have a great consumer trust
// product and no licensable edge yet; if pureModel beats / independently adds
// to the market, THAT is the asset. n is tiny early — always shown with it.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { SHADOW_VERSIONS } from '../engine/shadowPredict.js';

const WC_MODEL = 'wc-elo-market-v1';

function brier1x2(p, actual) {
  if (!p || !Number.isFinite(p.home)) return null;
  const h = p.home / 100, d = p.draw / 100, a = p.away / 100;
  const yH = actual === 'HOME' ? 1 : 0;
  const yD = actual === 'DRAW' ? 1 : 0;
  const yA = actual === 'AWAY' ? 1 : 0;
  return ((h - yH) ** 2 + (d - yD) ** 2 + (a - yA) ** 2) / 3;
}

function avg(arr) {
  const v = arr.filter(x => Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
const r4 = (v) => (v == null ? null : parseFloat(v.toFixed(4)));
const parse = (f) => (typeof f === 'string' ? safeJson(f) : f);
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

/**
 * @returns {Promise<{blended:number|null, pureModel:number|null,
 *   marketOnly:number|null, clv:Object|null, n:number}>}
 */
export async function computeLedger() {
  if (!isDbAvailable()) return { blended: null, pureModel: null, marketOnly: null, clv: null, n: 0 };

  // Scored WC predictions with the stored model+market probabilities.
  const r = await safeQuery(`
    SELECT p.id, p.fixture_id, p.features, p.actual_result,
           mp.brier_score AS blended_brier
    FROM predictions p
    JOIN model_performance mp ON mp.prediction_id = p.id
    WHERE p.model_version = $1
      AND p.actual_result IS NOT NULL
      AND p.features IS NOT NULL
    ORDER BY mp.created_at DESC
    LIMIT 500
  `, [WC_MODEL]);

  const rows = r?.rows || [];
  const blendedArr = [], pureArr = [], marketArr = [];
  const fixtureIds = [];

  for (const row of rows) {
    const f = parse(row.features) || {};
    const actual = row.actual_result;
    if (Number.isFinite(Number(row.blended_brier))) blendedArr.push(Number(row.blended_brier));
    const pm = brier1x2(f.modelProbs, actual);
    if (pm != null) pureArr.push(pm);
    const mm = brier1x2(f.marketProbs, actual);
    if (mm != null) marketArr.push(mm);
    if (row.fixture_id) fixtureIds.push(row.fixture_id);
  }

  const clv = await computeClv(fixtureIds, rows);

  return {
    blended: r4(avg(blendedArr)),
    pureModel: r4(avg(pureArr)),
    marketOnly: r4(avg(marketArr)),
    clv,
    n: rows.length,
  };
}

/**
 * Closing-line value: did our locked call lead the market? For each scored
 * fixture we compare the consensus implied probability of OUR PICK at the
 * first lock-cycle snapshot vs the last pre-kickoff snapshot. The market
 * drifting toward our pick (Δ>0) is the signal a model adds information.
 */
async function computeClv(fixtureIds, rows) {
  if (!fixtureIds.length) return null;
  const snaps = await safeQuery(`
    SELECT fixture_id, outcome, implied_prob, captured_at
    FROM odds_history
    WHERE bookmaker = 'consensus' AND market = '1X2'
      AND fixture_id = ANY($1)
    ORDER BY fixture_id, captured_at ASC
  `, [fixtureIds]);

  // Group snapshots by fixture → { HOME:[{t,p}], DRAW:[...], AWAY:[...] }.
  const byFixture = new Map();
  for (const s of snaps?.rows || []) {
    if (!byFixture.has(s.fixture_id)) byFixture.set(s.fixture_id, {});
    const g = byFixture.get(s.fixture_id);
    (g[s.outcome] ||= []).push({ t: new Date(s.captured_at).getTime(), p: Number(s.implied_prob) });
  }

  // Our pick per fixture = argmax of the stored modelProbs.
  const pickByFixture = new Map();
  for (const row of rows) {
    const f = parse(row.features) || {};
    const m = f.modelProbs;
    if (!m || !Number.isFinite(m.home) || !row.fixture_id) continue;
    const pick = (m.home >= m.draw && m.home >= m.away) ? 'HOME' : (m.away >= m.draw ? 'AWAY' : 'DRAW');
    pickByFixture.set(row.fixture_id, pick);
  }

  const deltas = [];
  let beat = 0, counted = 0;
  for (const [fid, pick] of pickByFixture) {
    const series = byFixture.get(fid)?.[pick];
    if (!series || series.length < 2) continue;       // need entry + close
    series.sort((a, b) => a.t - b.t);
    const entry = series[0].p, close = series[series.length - 1].p;
    if (!Number.isFinite(entry) || !Number.isFinite(close)) continue;
    const delta = close - entry;                       // percentage points
    deltas.push(delta);
    if (delta > 0) beat++;
    counted++;
  }

  if (!counted) return { n: 0, beatCloseRate: null, meanDeltaPts: null };
  return {
    n: counted,
    beatCloseRate: parseFloat(((beat / counted) * 100).toFixed(1)),
    meanDeltaPts: parseFloat((deltas.reduce((s, d) => s + d, 0) / counted).toFixed(2)),
  };
}

/**
 * Per-shadow-track ledger, as a FAIR head-to-head: each shadow track's Brier vs
 * the published model's pure + blended Brier over the EXACT SAME fixtures (joined
 * on fixture_id). This is the promotion signal — a track earns promotion only by
 * beating the pure model on shared matches, scored market-blind. Returns [] until
 * the shadow tracks have scored rows (they only exist after the flags are on).
 * @returns {Promise<{tracks:Array, n:number}>}
 */
export async function computeShadowLedger() {
  if (!isDbAvailable()) return { tracks: [], n: 0 };
  let r;
  try {
    r = await safeQuery(`
      SELECT s.model_version, s.features AS s_features, s.actual_result,
             b.features AS b_features, b.prob_home AS bh, b.prob_draw AS bd, b.prob_away AS ba
      FROM predictions s
      JOIN predictions b ON b.fixture_id = s.fixture_id AND b.model_version = $2
      WHERE s.model_version = ANY($1)
        AND s.actual_result IS NOT NULL
        AND s.features IS NOT NULL AND b.features IS NOT NULL
      LIMIT 5000
    `, [SHADOW_VERSIONS, WC_MODEL]);
  } catch (e) {
    console.warn('[ledger] shadow ledger failed (ignored):', e.message);
    return { tracks: [], n: 0 };
  }

  // version → { shadow:[], pure:[], blended:[] } Brier arrays over shared matches.
  const acc = new Map();
  for (const row of r?.rows || []) {
    const sf = parse(row.s_features) || {}, bf = parse(row.b_features) || {};
    const actual = row.actual_result;
    const sB = brier1x2(sf.modelProbs, actual);
    const pB = brier1x2(bf.modelProbs, actual);
    const blB = brier1x2({ home: Number(row.bh), draw: Number(row.bd), away: Number(row.ba) }, actual);
    if (sB == null) continue;
    if (!acc.has(row.model_version)) acc.set(row.model_version, { shadow: [], pure: [], blended: [] });
    const g = acc.get(row.model_version);
    g.shadow.push(sB);
    if (pB != null) g.pure.push(pB);
    if (blB != null) g.blended.push(blB);
  }

  const tracks = [];
  for (const v of SHADOW_VERSIONS) {
    const g = acc.get(v);
    if (!g || !g.shadow.length) continue;
    const shadow = avg(g.shadow), pure = avg(g.pure), blended = avg(g.blended);
    tracks.push({
      version: v,
      n: g.shadow.length,
      brier: r4(shadow),
      vsPure: r4(pure),                                  // published model, pure, same matches
      vsBlended: r4(blended),                            // published model, blended, same matches
      beatsPure: shadow != null && pure != null ? shadow < pure : null,
      deltaVsPure: shadow != null && pure != null ? r4(pure - shadow) : null, // >0 = shadow better
    });
  }
  return { tracks, n: tracks.reduce((s, t) => s + t.n, 0) };
}

export default { computeLedger, computeShadowLedger };
