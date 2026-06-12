// Smoke test: build the daily picks email (v2 — plain words, flag tiles,
// animated header) from canned data and write the HTML for eyeballing.
import { writeFileSync } from 'fs';
import { buildDailyPicksEmail, buildWelcomeEmail } from '../services/dailyPicksEmail.js';

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
    id: 'apf_2', home: 'Canada', away: 'Bosnia & Herzegovina',
    kickoff: new Date('2026-06-13T01:00:00Z'),
    probs: { home: 44.0, draw: 28.0, away: 28.0 },
    lean: { team: 'Canada', prob: 44.0, edge: 6.3 },
    risk: 'HIGH',
    scoreline: { score: '1-0', probability: 12.4 },
  },
];

const receipts = [
  {
    match_external_id: 'apf_1489369',
    home_team: 'Mexico', away_team: 'South Africa', predicted_outcome: 'HOME',
    prediction_correct: true, brier_score: 0.0552,
    prob_home: 67.3, prob_draw: 21.5, prob_away: 11.2, hg: 2, ag: 0,
    scoreline_exact: true,
  },
  {
    match_external_id: 'apf_1538999',
    home_team: 'South Korea', away_team: 'Czech Republic', predicted_outcome: 'HOME',
    prediction_correct: false, brier_score: 0.2012,
    prob_home: 36.6, prob_draw: 29.7, prob_away: 33.7, hg: 2, ag: 1,
    scoreline_exact: false,
  },
];

const ledger = { total: 2, correct: 2, avg_brier: '0.128' };

// Full email
const out = buildDailyPicksEmail({ slate, receipts, ledger, date: new Date('2026-06-12T07:00:00Z') });
console.log('SUBJECT:', out.subject);
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
must(out.subject.includes('1 of 2 right'), 'subject should carry yesterday tally: ' + out.subject);
must(out.html.includes('email-header.gif'), 'animated header missing');
must(out.html.includes('We even called the exact score'), 'exact-score line missing');
must(out.html.includes('It stays on the record'), 'honest miss line missing');
must(out.html.includes('we lean this way') && out.html.includes('coin flip'), 'plain-words confidence missing');
must(out.html.includes('underrating Canada'), 'value chip missing (edge 6.3)');
must(!out.html.includes('underrating Brazil'), 'value chip should hide below 5pts');
must(!out.html.match(/Brier/i), 'jargon leak: Brier should not appear in v2 copy');
must(out.html.includes('accuracy score'), 'plain accuracy footnote missing');
must(out.html.includes('__UNSUB__') && out.text.includes('__UNSUB__'), 'unsub placeholder missing');
must(out.html.includes('email-flags/mx-l.webp') && out.html.includes('email-flags/za-r.webp'), 'Mexico/SA real-flag strips missing');
must(out.html.includes('flagcdn.com/w40/mx.png'), 'flag chip missing');
must(!out.html.includes('linear-gradient(100deg'), 'colour gradients must be gone (brand rule: real flags)');
must(out.html.includes('bgcolor="#FF0000"'), 'Canada probability bar colour missing');

// Rest day (no slate)
const rest = buildDailyPicksEmail({ slate: [], receipts, ledger, date: new Date() });
must(rest.subject.startsWith('How we did yesterday'), 'rest-day subject wrong: ' + rest.subject);

// First morning (no receipts)
const first = buildDailyPicksEmail({ slate, receipts: [], ledger: null, date: new Date() });
must(!first.html.includes('Yesterday'), 'empty receipts should hide section');
must(first.subject.includes('Today’s World Cup picks'), 'today-only subject wrong: ' + first.subject);

// Welcome email — no-slate fallback path (local key is stale → empty slate)
const welcome = await buildWelcomeEmail();
must(welcome.subject.includes('You’re in'), 'welcome subject wrong: ' + welcome.subject);
must(welcome.html.includes('email-header.gif') && welcome.html.includes('__UNSUB__'), 'welcome header/unsub missing');
must(welcome.html.includes('even when we’re wrong'), 'welcome honesty line missing');
writeFileSync('/tmp/oddyessa-email/welcome-preview.html', welcome.html);

writeFileSync('/tmp/oddyessa-email/daily-email-v2-preview.html', out.html);
console.log('TEXT VERSION:\n' + out.text);
console.log('\nAll assertions passed ✓ — preview at /tmp/oddyessa-email/daily-email-v2-preview.html');
