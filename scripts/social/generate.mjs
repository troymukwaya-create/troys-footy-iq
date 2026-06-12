// ─── DAILY SOCIAL GENERATOR ─────────────────────────────────────────
// Pulls live data from the production API, renders the Morning Ledger
// cards (template.html — real flag bleeds, brand canon) and writes the
// plain-words captions for every platform into scripts/social/out/.
//
//   node generate.mjs ledger   → yesterday's receipts + ledger card
//   node generate.mjs picks    → today's slate captions (text-first)
//
// Runs in GitHub Actions (CHROME_PATH from browser-actions/setup-chrome)
// or locally (falls back to the macOS Chrome path).

import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { NATION_ISO2 } from '../../backend/constants/nationFlags.js';

const API = process.env.ODDYESSA_API || 'https://troys-footy-iq-api.onrender.com/api';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const iso = (name) => NATION_ISO2[name] || null;
const flagEmoji = (name) => {
  const c = iso(name);
  if (!c || c.length !== 2) return '';
  return String.fromCodePoint(...[...c.toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
};
const pct = (v) => `${Math.round(Number(v))}%`;
const abbr = (name) => {
  const SPECIAL = { 'South Korea': 'KOR', 'South Africa': 'RSA', 'Czech Republic': 'CZE', Czechia: 'CZE', USA: 'USA', 'United States': 'USA', 'Bosnia & Herzegovina': 'BIH', 'Bosnia and Herzegovina': 'BIH' };
  return SPECIAL[name] || name.slice(0, 3).toUpperCase();
};

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'oddyessa-social/1' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

// Yesterday = every settled match in the last 26h (whole previous matchday).
async function getSettled() {
  const recent = await getJson(`${API}/results/recent`);
  const cutoff = Date.now() - 26 * 3600 * 1000;
  return (recent.data || [])
    .filter(r => r.match_date && new Date(r.match_date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
}

async function getLedgerStats() {
  const perf = await getJson(`${API}/performance`);
  const o = perf?.data?.overall;
  return o && Number(o.total_predictions) > 0
    ? { total: +o.total_predictions, correct: +o.correct, brier: +o.avg_brier }
    : null;
}

async function getSlate() {
  const up = await getJson(`${API}/fixtures/upcoming`);
  const horizon = Date.now() + 24 * 3600 * 1000;
  return (up.fixtures || [])
    .filter(f => f?.probability?.probabilities && f.league?.code === 'WC'
      && new Date(f.date).getTime() > Date.now() && new Date(f.date).getTime() <= horizon)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8)
    .map(f => {
      const p = f.probability;
      const { home, draw, away } = p.probabilities;
      const pick = home >= draw && home >= away ? f.homeTeam.name : (away >= draw ? f.awayTeam.name : 'Draw');
      return {
        home: f.homeTeam.name, away: f.awayTeam.name, date: f.date,
        probs: { home, draw, away }, pick,
        risk: p.riskLevel || 'MEDIUM',
        scoreline: p.topScorelines?.[0]?.score || null,
      };
    });
}

const RISK_PLAIN = { LOW: 'we’re confident', MEDIUM: 'we lean this way', HIGH: 'coin flip — could go anywhere' };
const fmtTime = (d) => new Date(d).toISOString().slice(11, 16) + ' UTC';

// ─── card rendering ─────────────────────────────────────────────────
async function withPage(fn) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=2'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1700, height: 1500, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(DIR, 'template.html'), { waitUntil: 'load', timeout: 60000 });
    await fn(page);
  } finally { await browser.close(); }
}

async function generateLedger() {
  const [settled, stats] = await Promise.all([getSettled(), getLedgerStats()]);
  if (!settled.length) {
    writeFileSync(path.join(OUT, 'ledger.json'), JSON.stringify({ skip: true, reason: 'no settled matches in window' }));
    console.log('no settled matches yesterday — ledger post skipped');
    return;
  }
  const nRight = settled.filter(s => s.prediction_correct).length;

  // verdicts give the scoreline + market calls per match
  const verdicts = {};
  for (const s of settled) {
    try {
      const a = await getJson(`${API}/analysis/${s.match_external_id}`);
      verdicts[s.match_external_id] = a?.verdict || a?.data?.verdict || null;
    } catch { verdicts[s.match_external_id] = null; }
  }

  const rows = settled.map(s => {
    const v = verdicts[s.match_external_id];
    const lean = { HOME: s.home_team, DRAW: 'Draw', AWAY: s.away_team }[s.predicted_outcome];
    const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
    const extra = v?.scoreline?.exact ? ` · scoreline ${v.scoreline.actual} called exact`
      : s.risk_level === 'HIGH' ? ' · a coin flip, called' : '';
    return {
      abbr: `${abbr(s.home_team)} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${abbr(s.away_team)}`,
      hit: !!s.prediction_correct,
      line: `<b>${lean} @ ${pct(leanP)}</b>${extra}`,
      brier: Number(s.brier_score).toFixed(3),
      hIso: iso(s.home_team), aIso: iso(s.away_team),
      hg: s.ft_home_goals ?? s.home_goals, ag: s.ft_away_goals ?? s.away_goals,
    };
  });

  const n = settled.length;
  const headline = nRight === n
    ? { a: `${n === 1 ? 'One call. One green.' : `${n} calls. ${n} greens.`}`, b: 'The ledger grows.' }
    : nRight === 0
      ? { a: `${n} calls. ${n} ${n === 1 ? 'miss' : 'misses'}.`, b: 'Printed anyway.' }
      : { a: `${n} calls. ${nRight} green${nRight === 1 ? '' : 's'}.`, b: 'All of them printed.' };

  await withPage(async (page) => {
    await page.evaluate((d) => window.renderLedger(d), {
      results: rows, headline,
      kicker: `WORLD CUP 2026 · THE MORNING LEDGER · ${new Date().toISOString().slice(0, 10)}`,
      note: stats && stats.total < 20 ? `n = ${stats.total}. It’s early. The ledger doesn’t care how it looks.` : 'Every result, in the same font.',
      ours: stats ? stats.brier : 0.187,
    });
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#ledger')).screenshot({ path: path.join(OUT, 'ledger.png') });

    // one receipt card per settled match (max 3 extra images)
    let i = 0;
    for (const s of settled.slice(0, 3)) {
      const v = verdicts[s.match_external_id];
      const lean = { HOME: s.home_team, DRAW: 'Draw', AWAY: s.away_team }[s.predicted_outcome];
      const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
      const items = [
        { lab: `CALL — ${lean === 'Draw' ? 'DRAW' : abbr(lean) + ' WIN'}`, val: pct(leanP), res: s.prediction_correct ? 'hit' : 'miss' },
        ...(v?.scoreline ? [{ lab: `SCORELINE ${v.scoreline.predicted}`, val: pct(v.scoreline.predictedProb), res: v.scoreline.exact ? 'hit' : 'miss' },
          v.scoreline.exact ? { sub: 'top of our grid · exact hit' } : { sub: `actual ${v.scoreline.actual}${v.scoreline.rankInTop ? ` — sat #${v.scoreline.rankInTop} in our grid` : ''}` }] : []),
        ...((v?.marketCalls || []).flatMap((mc, idx, arr) => [
          { lab: mc.label.toUpperCase(), val: pct(mc.prob), res: mc.hit ? 'hit' : 'miss' },
          // the first miss gets the honest annotation, like the hand-made cards
          ...(!mc.hit && arr.slice(0, idx).every(x => x.hit) ? [{ sub: 'missed. it stays on the receipt.' }] : []),
        ])),
      ];
      const he = flagEmoji(s.home_team), ae = flagEmoji(s.away_team);
      await page.evaluate((r) => window.renderReceipt(r), {
        title: `${he} ${s.home_team} v ${s.away_team} ${ae}`,
        ft: `${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals}`,
        kicker: 'MATCH RECEIPT · WORLD CUP 2026',
        meta: `${new Date(s.match_date).toISOString().slice(0, 10).toUpperCase()} · LOCKED BEFORE KICKOFF`,
        items,
        brier: Number(s.brier_score).toFixed(4),
        stampText: s.prediction_correct ? (v?.scoreline?.exact ? 'SETTLED · EXACT' : 'SETTLED · CALLED') : 'SETTLED · MISSED',
        stampMiss: !s.prediction_correct,
        hIso: iso(s.home_team), aIso: iso(s.away_team),
      });
      await page.evaluate(() => window.imagesReady());
      await (await page.$('#receipt-stage')).screenshot({ path: path.join(OUT, `receipt-${i++}.png`) });
    }
  });

  const caption = [
    nRight === n
      ? `Yesterday: ${n === 1 ? 'one call, one green' : `${n} calls, ${n} greens`}. ${n === 1 ? '' : 'All of them locked before kickoff.'}`
      : `Yesterday: we got ${nRight} of ${n} right. The misses are printed in the same font.`,
    '',
    ...settled.map(s => {
      const v = verdicts[s.match_external_id];
      const lean = { HOME: s.home_team, DRAW: 'a draw', AWAY: s.away_team }[s.predicted_outcome];
      const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
      return `${flagEmoji(s.home_team)} ${s.home_team} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${s.away_team} ${flagEmoji(s.away_team)} — we said ${lean} (${pct(leanP)})${s.prediction_correct ? ' ✓' : ' ✗'}${v?.scoreline?.exact ? ' · exact score called' : ''}`;
    }),
    '',
    stats ? `This World Cup so far: ${stats.correct} of ${stats.total} winners called.` : '',
    '',
    'Every call locked before kickoff, graded in public.',
    'oddyessa.com',
  ].filter(l => l !== null).join('\n');

  writeFileSync(path.join(OUT, 'ledger.json'), JSON.stringify({
    caption, images: ['ledger.png', ...settled.slice(0, 3).map((_, j) => `receipt-${j}.png`)],
  }, null, 2));
  console.log(`ledger generated: ${n} matches, ${nRight} right`);
}

async function generatePicks() {
  const slate = await getSlate();
  if (!slate.length) {
    writeFileSync(path.join(OUT, 'picks.json'), JSON.stringify({ skip: true, reason: 'no matches in next 24h' }));
    console.log('no matches in the next 24h — picks post skipped');
    return;
  }
  const caption = [
    `Today’s calls — ${slate.length} ${slate.length === 1 ? 'game' : 'games'}:`,
    '',
    ...slate.map(m => [
      `${flagEmoji(m.home)} ${m.home} v ${m.away} ${flagEmoji(m.away)} · ${fmtTime(m.date)}`,
      `Our pick: ${m.pick} (${pct(m.probs[m.pick === m.home ? 'home' : m.pick === m.away ? 'away' : 'draw'])}) — ${RISK_PLAIN[m.risk] || ''}${m.scoreline ? ` · most likely ${m.scoreline}` : ''}`,
      '',
    ].join('\n')),
    'Numbers can shift until each game locks before kickoff — the locked call is what we grade ourselves on.',
    '',
    'Full reasoning: oddyessa.com',
  ].join('\n');

  writeFileSync(path.join(OUT, 'picks.json'), JSON.stringify({ caption, images: [] }, null, 2));
  console.log(`picks generated: ${slate.length} matches`);
}

const mode = process.argv[2];
if (mode === 'ledger') await generateLedger();
else if (mode === 'picks') await generatePicks();
else { console.error('usage: node generate.mjs ledger|picks'); process.exit(1); }
