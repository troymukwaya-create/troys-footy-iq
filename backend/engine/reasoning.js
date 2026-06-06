// ─── PREDICTION REASONING ("Why this prediction") ───────────────────
// Turns the model's internal factors into plain-language reasons a casual
// fan understands: "X is favoured BECAUSE ...". Works for both club and
// national teams. Each reason = { key, favors: 'home'|'away'|'even', text }.

const pct = (n) => Math.round(Number(n) || 0);

export function buildReasoning({ homeName, awayName, prediction, homeStats, awayStats, h2h }) {
  const reasons = [];
  const p = prediction?.probabilities || {};
  const favoured = (p.home >= p.draw && p.home >= p.away) ? 'home'
    : (p.away >= p.draw && p.away >= p.home) ? 'away' : 'even';
  const favName = favoured === 'home' ? homeName : favoured === 'away' ? awayName : null;

  // 1. Strength — Elo for national teams (host advantage flagged separately)
  const ns = prediction?.nationalStrength;
  if (ns && ns.homeElo && ns.awayElo) {
    const diff = ns.homeElo - ns.awayElo;
    if (Math.abs(diff) >= 25) {
      const stronger = diff > 0 ? homeName : awayName;
      reasons.push({ key: 'strength', favors: diff > 0 ? 'home' : 'away',
        text: `${stronger} are the stronger side on ranking & form (Elo ${Math.max(ns.homeElo, ns.awayElo)} vs ${Math.min(ns.homeElo, ns.awayElo)}).` });
    } else {
      reasons.push({ key: 'strength', favors: 'even',
        text: `Closely matched on strength (Elo ${ns.homeElo} vs ${ns.awayElo}).` });
    }
    if (ns.neutral === false) {
      reasons.push({ key: 'home', favors: 'home', text: `${homeName} have home advantage as a host nation.` });
    }
  }

  // 2. Recent form
  const fmt = (s) => (s?.form && s.form !== 'N/A') ? s.form.split('').slice(0, 5).join('-') : null;
  const hf = fmt(homeStats), af = fmt(awayStats);
  if (hf) reasons.push({ key: 'form', favors: 'home', text: `${homeName} recent form: ${hf}.` });
  if (af) reasons.push({ key: 'form', favors: 'away', text: `${awayName} recent form: ${af}.` });

  // 3. Goals (attack / defence)
  if (homeStats?.avgGoalsFor != null && awayStats?.avgGoalsFor != null) {
    reasons.push({ key: 'goals', favors: 'even',
      text: `${homeName} average ${homeStats.avgGoalsFor} scored / ${homeStats.avgGoalsAgainst} conceded; ${awayName} ${awayStats.avgGoalsFor} / ${awayStats.avgGoalsAgainst}.` });
  }

  // 3b. Defensive record (clean sheets) — from deep recent form
  for (const [side, st, name] of [['home', homeStats, homeName], ['away', awayStats, awayName]]) {
    if (st && st.cleanSheets != null && st.played >= 4 && st.cleanSheets >= Math.ceil(st.played / 2)) {
      reasons.push({ key: 'defense', favors: side, text: `${name} are defensively solid — ${st.cleanSheets} clean sheets in their last ${st.played}.` });
    }
  }

  // 4. Head-to-head
  if (h2h && h2h.totalMatches > 0) {
    const hw = h2h.homeWins || 0, aw = h2h.awayWins || 0, dr = h2h.draws || 0, tot = h2h.totalMatches;
    if (hw > aw) reasons.push({ key: 'h2h', favors: 'home', text: `${homeName} have the head-to-head edge — won ${hw} of the last ${tot} meetings.` });
    else if (aw > hw) reasons.push({ key: 'h2h', favors: 'away', text: `${awayName} have the head-to-head edge — won ${aw} of the last ${tot} meetings.` });
    else reasons.push({ key: 'h2h', favors: 'even', text: `Evenly matched historically (${hw}-${dr}-${aw} across ${tot} meetings).` });
  }

  // 4b. Last meeting result (often the most telling single data point)
  if (h2h?.matches?.length) {
    const lm = h2h.matches[0];
    if (lm.homeGoals != null && lm.awayGoals != null) {
      const yr = lm.date ? new Date(lm.date).getFullYear() : '';
      reasons.push({ key: 'h2h-last', favors: 'even', text: `Last meeting: ${lm.home} ${lm.homeGoals}-${lm.awayGoals} ${lm.away}${yr ? ` (${yr})` : ''}.` });
    }
  }

  // 5. Market agreement / value edge
  const mk = prediction?.marketProbs, ve = prediction?.valueEdges;
  if (mk && ve && favName && favoured !== 'even') {
    const edge = ve[favoured];
    if (edge >= 4) reasons.push({ key: 'value', favors: favoured, text: `Value spotted — our model rates ${favName} ${pct(p[favoured])}%, about ${Math.round(edge)}% higher than the bookmakers.` });
    else if (edge <= -4) reasons.push({ key: 'market', favors: 'even', text: `Bookmakers are higher on ${favName} than our model — we stay more cautious here.` });
    else reasons.push({ key: 'market', favors: favoured, text: `The bookmakers agree — ${favName} are favourites too.` });
  }

  // 6. Most likely scoreline
  const top = prediction?.topScorelines?.[0];
  if (top) reasons.push({ key: 'scoreline', favors: 'even', text: `Most likely result: ${top.score} (${pct(top.probability)}% chance).` });

  return {
    favoured,
    favName,
    headline: favName ? `${favName} ${pct(p[favoured])}% — here's why` : `A tight one — here's the read`,
    reasons,
  };
}

export default { buildReasoning };
