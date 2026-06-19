// ─── xG-AWARE FORM ──────────────────────────────────────────────────
// Recent form was goals-only: a lucky 1-0 and a dominant 1-0 looked identical.
// Now that real World Cup matches have been played, each has shot/xG data
// (API-Football `fixtures/statistics`, which we already fetch for the match
// page). We regress a team's recent scoring/conceding RATE toward its xG to
// strip out finishing variance — the single richest unused signal we pay for.
//
// Bounded + additive: with no xG samples it returns the form unchanged. The
// xG pull is capped at 50% so a one-match xG sample can never overwhelm the
// goals a team actually scored.
//
// Pure + dependency-free → fully unit-testable.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const XG_WEIGHT_CAP = 0.5;   // xG never pulls form more than halfway
const XG_FULL_AT = 3;        // ~3 matches with xG → full (capped) weight

// API-Football reports xG under a few spellings ('expected_goals',
// 'Expected Goals', 'Expected goals'); the value can be a string ('1.45').
function readXg(statBlock) {
  if (!statBlock || typeof statBlock !== 'object') return null;
  for (const [k, v] of Object.entries(statBlock)) {
    if (/expected.?goals/i.test(k)) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * Pull one team's xG for/against out of a getFixtureStats() result
 * (shape: { teamNameA: {statType: value}, teamNameB: {...} }).
 * @returns {{xgFor:number, xgAgainst:number}|null}
 */
export function extractTeamXg(fixtureStats, teamName) {
  if (!fixtureStats || typeof fixtureStats !== 'object') return null;
  const names = Object.keys(fixtureStats);
  if (names.length < 2 || !teamName) return null;
  const norm = (s) => String(s || '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '').trim();
  const want = norm(teamName);
  const mineKey = names.find(n => norm(n) === want) || names.find(n => norm(n).includes(want) || want.includes(norm(n)));
  if (!mineKey) return null;
  const oppKey = names.find(n => n !== mineKey);
  const xgFor = readXg(fixtureStats[mineKey]);
  const xgAgainst = readXg(fixtureStats[oppKey]);
  if (xgFor == null && xgAgainst == null) return null;
  return { xgFor: xgFor ?? 0, xgAgainst: xgAgainst ?? 0 };
}

/**
 * Blend a team's recent form goals toward its xG over the matches we have
 * xG for. Returns a new form object with adjusted avgGoalsFor/avgGoalsAgainst
 * (raw values preserved) plus an `xg` summary for transparency.
 *
 * @param {Object} form - getTeamRecentForm() output (avgGoalsFor/avgGoalsAgainst)
 * @param {Array<{xgFor:number, xgAgainst:number}>} samples - per-match xG
 * @returns {Object} form (unchanged when no usable samples)
 */
export function blendFormWithXg(form, samples = []) {
  if (!form || !Array.isArray(samples) || !samples.length) return form;
  const valid = samples.filter(s => s && (Number.isFinite(s.xgFor) || Number.isFinite(s.xgAgainst)));
  if (!valid.length) return form;

  const avgXgFor = valid.reduce((a, s) => a + (Number(s.xgFor) || 0), 0) / valid.length;
  const avgXgAgainst = valid.reduce((a, s) => a + (Number(s.xgAgainst) || 0), 0) / valid.length;

  const w = clamp(valid.length / XG_FULL_AT, 0, 1) * XG_WEIGHT_CAP;
  const rawFor = Number(form.avgGoalsFor);
  const rawAgainst = Number(form.avgGoalsAgainst);
  if (!Number.isFinite(rawFor) || !Number.isFinite(rawAgainst)) return form;

  const adjFor = (1 - w) * rawFor + w * avgXgFor;
  const adjAgainst = (1 - w) * rawAgainst + w * avgXgAgainst;

  return {
    ...form,
    avgGoalsFor: parseFloat(adjFor.toFixed(2)),
    avgGoalsAgainst: parseFloat(adjAgainst.toFixed(2)),
    rawAvgGoalsFor: parseFloat(rawFor.toFixed(2)),
    rawAvgGoalsAgainst: parseFloat(rawAgainst.toFixed(2)),
    xg: {
      avgXgFor: parseFloat(avgXgFor.toFixed(2)),
      avgXgAgainst: parseFloat(avgXgAgainst.toFixed(2)),
      matches: valid.length,
      weight: parseFloat(w.toFixed(3)),
    },
  };
}

export default { extractTeamXg, blendFormWithXg };
