// ─── SCORELINE DISPLAY HONESTY ──────────────────────────────────────
// The exact scoreline is the single most-likely score in the Dixon-Coles
// grid — and for two evenly-matched teams that is genuinely 1-1 (~13%),
// barely ahead of 2-1/1-0. Asserting "predicted score: 1-1" on every tight
// game reads as a lazy, identical call even though each game's underlying
// distribution is different.
//
// So we only HEADLINE a specific scoreline when there's a clear favourite and
// the top score is a win consistent with that favourite (e.g. a mismatch →
// "2-0 likely"). Otherwise we say the game is OPEN and show the spread of
// most-likely scores — honest, and visibly different per game.
//
// Pure + dependency-free.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? (n > 1 ? n : n * 100) : 0; };

function parseScore(s) {
  const m = /^(\d+)\s*[-–:]\s*(\d+)$/.exec(String(s || '').trim());
  return m ? { h: +m[1], a: +m[2] } : null;
}

const FAVOURITE_THRESHOLD = 55;   // a "clear favourite" — below this the game is OPEN

/**
 * Classify a fixture's scoreline call.
 * @param {{probabilities?:{home,draw,away}, topScorelines?:Array<{score,probability}>}} prob
 * @returns {{confident:boolean, score:string|null, spread:Array<{score:string,probability:number}>}}
 */
export function scorelineSummary(prob) {
  const p = prob?.probabilities || {};
  const home = num(p.home), draw = num(p.draw), away = num(p.away);
  const sls = (prob?.topScorelines || []).filter(s => s && s.score && parseScore(s.score));
  const spread = sls.slice(0, 3).map(s => ({ score: s.score, probability: Math.round(num(s.probability)) }));

  const top = sls[0];
  const fav = Math.max(home, draw, away);
  const favSide = home >= draw && home >= away ? 'home' : away >= draw ? 'away' : 'draw';

  let confident = false;
  if (top && fav >= FAVOURITE_THRESHOLD && favSide !== 'draw') {
    const t = parseScore(top.score);
    // The headline score must be a WIN for the actual favourite — otherwise a
    // low-scoring favourite whose modal score is 1-1 would be mislabelled.
    confident = favSide === 'home' ? t.h > t.a : t.a > t.h;
  }

  return { confident, score: confident ? top.score : null, spread };
}

export default { scorelineSummary };
