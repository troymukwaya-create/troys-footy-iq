// Re-grade the live ledger with the new grading module and print old-vs-new.
// Pulls the public results feed (no DB creds needed) so it can run anywhere.
//   node backend/scripts/grading-regrade.mjs
import { gradeOutcome, gradeMatch, gradeScoreline } from '../engine/grading.js';

const API = process.env.ODDYESSA_API || 'https://troys-footy-iq-api.onrender.com/api';

const rows = await fetch(`${API}/results/recent`)
  .then((r) => r.json())
  .then((d) => (Array.isArray(d) ? d : d.data || []));

let oldRed = 0;
const tally = { ON_READ: 0, IN_RANGE: 0, AGAINST: 0, MISSED: 0 };

for (const row of rows) {
  const o = gradeOutcome({
    probHome: row.prob_home, probDraw: row.prob_draw,
    probAway: row.prob_away, actualResult: row.actual_outcome,
  });
  if (!o) continue;
  const m = gradeMatch({ outcome: o, scoreline: null });
  if (row.prediction_correct === false) oldRed++;
  tally[o.tier]++;
  const hg = row.ft_home_goals ?? row.home_goals;
  const ag = row.ft_away_goals ?? row.away_goals;
  const oldFlag = row.prediction_correct ? 'GREEN' : 'RED  ';
  console.log(
    `${oldFlag} → ${o.label.padEnd(13)} | ${row.home_team} ${hg}-${ag} ${row.away_team}`.padEnd(70) +
    `| P(actual)=${Math.round(o.pActual * 100)}% rank#${o.rank} | ${m.stampText}`
  );
}

console.log('\n──────────────────────────────────────────────');
console.log(`OLD: ${oldRed} reds / ${rows.length}`);
console.log(`NEW: ${tally.ON_READ} on read · ${tally.IN_RANGE} in range · ${tally.AGAINST} against · ${tally.MISSED} missed`);
console.log(`Genuine reds under the new system: ${tally.MISSED}`);
