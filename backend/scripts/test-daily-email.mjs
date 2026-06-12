// Smoke test: build the daily picks email from canned data (the real
// Day-1 shapes) and write the HTML so it can be eyeballed in a browser.
import { writeFileSync } from 'fs';
import { buildDailyPicksEmail } from '../services/dailyPicksEmail.js';

const slate = [
  {
    id: 'apf_1', home: 'Brazil', away: 'Morocco',
    kickoff: new Date('2026-06-12T19:00:00Z'),
    probs: { home: 58.4, draw: 24.1, away: 17.5 },
    lean: { team: 'Brazil', prob: 58.4, edge: 1.2 },
    risk: 'MEDIUM',
    scoreline: { score: '2-1', probability: 11.9 },
  },
  {
    id: 'apf_2', home: 'Canada', away: 'Bosnia and Herzegovina',
    kickoff: new Date('2026-06-13T01:00:00Z'),
    probs: { home: 44.0, draw: 28.0, away: 28.0 },
    lean: { team: 'Canada', prob: 44.0, edge: 6.3 },
    risk: 'HIGH',
    scoreline: { score: '1-0', probability: 12.4 },
  },
];

const receipts = [
  {
    home_team: 'Mexico', away_team: 'South Africa', predicted_outcome: 'HOME',
    prediction_correct: true, brier_score: 0.0552,
    prob_home: 67.3, prob_draw: 21.5, prob_away: 11.2, hg: 2, ag: 0,
  },
  {
    home_team: 'South Korea', away_team: 'Czech Republic', predicted_outcome: 'HOME',
    prediction_correct: false, brier_score: 0.2012,
    prob_home: 36.6, prob_draw: 29.7, prob_away: 33.7, hg: 2, ag: 1,
  },
];

const ledger = { total: 2, correct: 2, avg_brier: '0.128' };

// Full email
let out = buildDailyPicksEmail({ slate, receipts, ledger, date: new Date('2026-06-12T07:00:00Z') });
console.log('SUBJECT:', out.subject);
if (!out.subject.includes('2 matches') || !out.subject.includes('1/2')) throw new Error('subject wrong: ' + out.subject);
if (!out.html.includes('Mexico') || !out.html.includes('__UNSUB__')) throw new Error('html missing pieces');
if (!out.html.includes('+6 pts vs market')) throw new Error('edge chip missing');
if (out.html.includes('+1 pts')) throw new Error('edge chip should hide below 5pts');
if (!out.text.includes('Unsubscribe: __UNSUB__')) throw new Error('text unsub missing');

// No matches today (rest day)
const rest = buildDailyPicksEmail({ slate: [], receipts, ledger, date: new Date() });
if (!rest.subject.startsWith('The ledger')) throw new Error('rest-day subject wrong: ' + rest.subject);

// No receipts (first morning)
const first = buildDailyPicksEmail({ slate, receipts: [], ledger: null, date: new Date() });
if (first.html.includes('YESTERDAY')) throw new Error('empty receipts should hide section');

writeFileSync('/tmp/oddyessa-day1/daily-email-preview.html',
  `<body style="background:#222;padding:20px">${out.html}</body>`);
console.log('TEXT VERSION:\n' + out.text);
console.log('\nAll assertions passed ✓ — preview at /tmp/oddyessa-day1/daily-email-preview.html');
