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
import { flagIso } from '../../backend/constants/nationFlags.js';
import { gradeRow } from '../../backend/engine/grading.js';

const API = process.env.ODDYESSA_API || 'https://troys-footy-iq-api.onrender.com/api';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Resolve through flagIso so provider name variants (e.g. "Cape Verde
// Islands", "Türkiye") find their flag instead of blanking the bleed.
const iso = (name) => flagIso(name);
const flagEmoji = (name) => {
  const c = iso(name);
  if (!c || c.length !== 2) return '';
  return String.fromCodePoint(...[...c.toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
};
const pct = (v) => `${Math.round(Number(v))}%`;
// Map a grade tone (green/steel/amber/red/gold) to the template's stamp class
// (base stamp is green; .stamp.{range,amber,gold,miss} exist). Without this,
// tone 'red' (MISSED) and 'steel' (IN_RANGE) fall through to the green base —
// i.e. a genuine miss would print a GREEN "SETTLED · MISSED" stamp.
const STAMP_CLASS = { green: '', steel: 'range', amber: 'amber', red: 'miss', gold: 'gold' };
const stampClassOf = (g, correct) => (g?.tone ? (STAMP_CLASS[g.tone] ?? '') : (correct ? '' : 'miss'));
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


// Hashtags are derived from the morning's matches — during a World Cup,
// the matches ARE what's trending. Match codes use the broadcast format
// (#MEXRSA). Dosage per platform: X 2-3 (more reads as spam and counts
// against 280), Instagram ~14 (discovery rewards volume), Telegram 3.
const tag = (s) => '#' + String(s).replace(/[^A-Za-z0-9]/g, '');
function buildHashtags(matchups) {
  const matchTags = matchups.map(([h, a]) => '#' + abbr(h) + abbr(a));
  const teamTags = [...new Set(matchups.flat())].map(tag);
  return {
    x: ['#FIFAWorldCup', ...matchTags.slice(0, 2)].join(' '),
    ig: [...new Set(['#WorldCup2026', '#FIFAWorldCup', '#WorldCup', ...matchTags,
      ...teamTags, '#Football', '#Soccer', '#FootballPredictions', '#SoccerPicks',
      '#WorldCupPredictions', '#ReadTheGame'])].slice(0, 15).join(' '),
    tg: ['#WorldCup2026', ...matchTags.slice(0, 2)].join(' '),
  };
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
  // verdicts give the scoreline + market calls per match
  const verdicts = {};
  for (const s of settled) {
    try {
      const a = await getJson(`${API}/analysis/${s.match_external_id}`);
      verdicts[s.match_external_id] = a?.verdict || a?.data?.verdict || null;
    } catch { verdicts[s.match_external_id] = null; }
  }

  // Grade every match the honest way: the lean judged by the probability we
  // gave the actual result, the scoreline judged on its own. The card uses
  // the API's grade when present, else recomputes from the same module.
  const grades = {};
  for (const s of settled) {
    grades[s.match_external_id] = s.grade
      || gradeRow(s, verdicts[s.match_external_id]?.scoreline || null);
  }
  const tierOf = (s) => grades[s.match_external_id]?.outcome?.tier || 'IN_RANGE';
  const nCalled = settled.filter(s => tierOf(s) === 'ON_READ').length;   // top outcome landed
  const nRange = settled.filter(s => tierOf(s) === 'IN_RANGE').length;   // inside our range
  const nMissed = settled.filter(s => grades[s.match_external_id]?.stampMiss).length; // genuine reds

  const rows = settled.map(s => {
    const v = verdicts[s.match_external_id];
    const g = grades[s.match_external_id];
    const lean = { HOME: s.home_team, DRAW: 'Draw', AWAY: s.away_team }[s.predicted_outcome];
    const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
    const extra = v?.scoreline?.exact ? ` · scoreline ${v.scoreline.actual} called exact`
      : tierOf(s) === 'IN_RANGE' ? ` · the ${Math.round((g?.outcome?.pActual || 0) * 100)}% result, inside our range`
      : s.risk_level === 'HIGH' ? ' · a coin flip, called' : '';
    return {
      abbr: `${abbr(s.home_team)} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${abbr(s.away_team)}`,
      res: g?.res || (s.prediction_correct ? 'hit' : 'miss'),
      line: `<b>${lean} @ ${pct(leanP)}</b>${extra}`,
      brier: Number(s.brier_score).toFixed(3),
      hIso: iso(s.home_team), aIso: iso(s.away_team),
      hg: s.ft_home_goals ?? s.home_goals, ag: s.ft_away_goals ?? s.away_goals,
    };
  });

  const n = settled.length;
  const headline = nCalled === n
    ? { a: `${n === 1 ? 'One call. One green.' : `${n} calls. ${n} greens.`}`, b: 'The ledger grows.' }
    : nMissed === 0
      ? { a: `${n} calls. Zero misses.`, b: `${nCalled} called, ${nRange} inside the range.` }
      : { a: `${n} calls. ${nMissed} genuine miss${nMissed === 1 ? '' : 'es'}.`, b: 'Printed in the same font.' };

  await withPage(async (page) => {
    await page.evaluate((d) => window.renderLedger(d), {
      results: rows, headline,
      kicker: `WORLD CUP 2026 · THE MORNING LEDGER · ${new Date().toISOString().slice(0, 10)}`,
      note: stats && stats.total < 20 ? `n = ${stats.total}. It’s early. The ledger doesn’t care how it looks.` : 'Every result, in the same font.',
      ours: stats ? stats.brier : 0.187,
    });
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#ledger')).screenshot({ path: path.join(OUT, 'ledger.png') });

    await page.evaluate((d) => window.renderLedgerIG(d), {
      results: rows, headline,
      kickerShort: 'THE MORNING LEDGER',
      note: stats && stats.total < 20 ? `n = ${stats.total}. It’s early.` : 'Every result, in the same font.',
      ours: stats ? stats.brier : 0.187,
    });
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#ledger-ig')).screenshot({ path: path.join(OUT, 'ledger-ig-raw.png') });

    // one receipt card per settled match (max 3 extra images)
    let i = 0;
    for (const s of settled.slice(0, 3)) {
      const v = verdicts[s.match_external_id];
      const g = grades[s.match_external_id];
      const lean = { HOME: s.home_team, DRAW: 'Draw', AWAY: s.away_team }[s.predicted_outcome];
      const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
      // The CALL row carries the graded tone (called / in range / against /
      // miss), and an in-range/against game gets the honest one-line context
      // instead of a bare red ✗.
      const callRes = g?.res || (s.prediction_correct ? 'hit' : 'miss');
      const items = [
        { lab: `CALL — ${lean === 'Draw' ? 'DRAW' : abbr(lean) + ' WIN'}`, val: pct(leanP), res: callRes },
        ...(g?.blurb && callRes !== 'hit' ? [{ sub: g.blurb.toLowerCase() }] : []),
        // Scoreline is its own call: exact = gold hit, otherwise neutral (a
        // non-exact scoreline is never a "miss" — exact scores are ~1-in-8).
        ...(v?.scoreline ? [{ lab: `SCORELINE ${v.scoreline.predicted}`, val: pct(v.scoreline.predictedProb), res: v.scoreline.exact ? 'hit' : 'range' },
          v.scoreline.exact ? { sub: 'top of our grid · exact hit' } : { sub: `actual ${v.scoreline.actual}${v.scoreline.rankInTop ? ` — sat #${v.scoreline.rankInTop} in our grid` : ' — outside our top grid'}` }] : []),
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
        stampText: g?.stampText || 'SETTLED',
        stampTone: stampClassOf(g, s.prediction_correct),
        stampMiss: !!g?.stampMiss,
        hIso: iso(s.home_team), aIso: iso(s.away_team),
      });
      await page.evaluate(() => window.imagesReady());
      await (await page.$('#receipt-stage')).screenshot({ path: path.join(OUT, `receipt-${i++}.png`) });
    }
  });

  // ✓ called · ≈ inside our range · ± against the read · ✗ genuine miss
  const MARK = { hit: ' ✓', range: ' ≈', amber: ' ±', miss: ' ✗' };
  const caption = [
    nCalled === n
      ? `Yesterday: ${n === 1 ? 'one call, one green' : `${n} calls, ${n} greens`}. ${n === 1 ? '' : 'All of them locked before kickoff.'}`
      : nMissed === 0
        ? `Yesterday: ${n} calls, zero misses — ${nCalled} called outright, ${nRange} landed inside our range.`
        : `Yesterday: ${nCalled} called, ${nRange} inside our range, ${nMissed} genuine miss${nMissed === 1 ? '' : 'es'}. The misses are printed in the same font.`,
    '',
    ...settled.map(s => {
      const v = verdicts[s.match_external_id];
      const g = grades[s.match_external_id];
      const lean = { HOME: s.home_team, DRAW: 'a draw', AWAY: s.away_team }[s.predicted_outcome];
      const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
      const mark = MARK[g?.res] ?? (s.prediction_correct ? ' ✓' : ' ✗');
      return `${flagEmoji(s.home_team)} ${s.home_team} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${s.away_team} ${flagEmoji(s.away_team)} — we said ${lean} (${pct(leanP)})${mark}${v?.scoreline?.exact ? ' · exact score called' : ''}`;
    }),
    '',
    stats ? `This World Cup so far: ${stats.correct} of ${stats.total} winners called outright — every result graded in public.` : '',
    '',
    'Every call locked before kickoff, graded in public.',
    'oddyessa.com',
  ].filter(l => l !== null).join('\n');

  const captionX = caption
    .replace(/\n?oddyessa\.com\s*$/i, '')
    .replace(/Every call locked before kickoff, graded in public\./, 'Every call locked before kickoff, graded in public. Full receipts on the site — link in bio.')
    .trim();
  // IG-native finishing: exact 1080×1350, lanczos + unsharp + slight lift
  const { execFileSync } = await import('child_process');
  const finish = (src_, dst) => execFileSync('ffmpeg', ['-y', '-i', path.join(OUT, src_),
    '-vf', 'scale=1080:1350:flags=lanczos,unsharp=5:5:0.45,eq=contrast=1.05:saturation=1.06',
    path.join(OUT, dst)], { stdio: 'pipe' });
  // Morning ledger is the proof card ONLY. The per-match receipt cards already
  // go out as standalone receipts via social-matchday (~15 min after FT), so
  // bundling them here re-posted every result a second time. Keep just the
  // ledger / Brier-track card.
  const imagesIG = ['ledger-ig.png'];
  finish('ledger-ig-raw.png', 'ledger-ig.png');

  const tags = buildHashtags(settled.map(s => [s.home_team, s.away_team]));
  // X gets a compact, purpose-built caption: result lines + tags ≤ 280
  const XMARK = { hit: '✓ called', range: '≈ in range', amber: '± against', miss: '✗ missed' };
  const xLines = settled.map(s => {
    const v = verdicts[s.match_external_id];
    const g = grades[s.match_external_id];
    const mark = XMARK[g?.res] ?? (s.prediction_correct ? '✓ called' : '✗ missed');
    return `${flagEmoji(s.home_team)} ${abbr(s.home_team)} ${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals} ${abbr(s.away_team)} ${mark}${v?.scoreline?.exact ? ' · exact ✓' : ''}`;
  });
  const xHead = nMissed === 0 ? `Yesterday: ${n}/${n} inside our range ✓` : `Yesterday: ${nCalled} called, ${nRange} in range, ${nMissed} miss${nMissed === 1 ? '' : 'es'}`;
  let xCap = `${xHead}\n\n${xLines.join('\n')}\n\nEvery call locked before kickoff — full receipts on the site, link in bio.\n\n${tags.x}`;
  if (xCap.length > 278) xCap = `${xHead} — every call locked before kickoff. Full receipts on the site, link in bio.\n\n${tags.x}`;
  writeFileSync(path.join(OUT, 'ledger.json'), JSON.stringify({
    caption: caption + '\n\n' + tags.tg,
    captionX: xCap,
    hashtagsIG: tags.ig,
    images: ['ledger.png'],
    imagesIG,
  }, null, 2));
  console.log(`ledger generated: ${n} matches — ${nCalled} called, ${nRange} in range, ${nMissed} missed (+${imagesIG.length} IG-native cards)`);
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

  const tags = buildHashtags(slate.map(m => [m.home, m.away]));
  const shown = slate.slice(0, 4);
  const xLines = shown.map(m => `${flagEmoji(m.home)} ${abbr(m.home)} v ${abbr(m.away)} — ${m.pick === 'Draw' ? 'draw' : abbr(m.pick)} ${pct(m.probs[m.pick === m.home ? 'home' : m.pick === m.away ? 'away' : 'draw'])}${m.risk === 'HIGH' ? ' (coin flip)' : ''}`);
  let xCap = `Today’s calls:\n\n${xLines.join('\n')}${slate.length > shown.length ? `\n+${slate.length - shown.length} more on the site` : ''}\n\nWhy each pick — link in bio.\n\n${tags.x}`;
  if (xCap.length > 278) xCap = `Today’s calls — ${slate.length} games, locked before kickoff. Why each pick — link in bio.\n\n${tags.x}`;
  writeFileSync(path.join(OUT, 'picks.json'), JSON.stringify({
    caption: caption + '\n\n' + tags.tg,
    captionX: xCap,
    hashtagsIG: tags.ig,
    images: [],
  }, null, 2));
  console.log(`picks generated: ${slate.length} matches`);
}

// ─── single-match evening receipt ───────────────────────────────────
// For the result that can't wait for the morning ledger: one settled
// match, full receipt treatment, evening-voice captions.
//   node generate.mjs match apf_1539000
async function generateMatch(externalId) {
  if (!externalId) { console.error('usage: node generate.mjs match <external_id>'); process.exit(1); }
  const [recent, stats] = await Promise.all([getJson(`${API}/results/recent`), getLedgerStats()]);
  const s = (recent.data || []).find(r => r.match_external_id === externalId);
  if (!s) {
    writeFileSync(path.join(OUT, 'match.json'), JSON.stringify({ skip: true, reason: `${externalId} not scored yet` }));
    console.log(`${externalId} is not on the ledger yet — has the scoring run fired?`);
    return;
  }
  let verdict = null;
  try {
    const a = await getJson(`${API}/analysis/${externalId}`);
    verdict = a?.verdict || a?.data?.verdict || null;
  } catch { /* receipt still works without the verdict extras */ }

  const g = gradeRow(s, verdict?.scoreline || null);
  const tier = g?.outcome?.tier;
  const res = g?.res || (s.prediction_correct ? 'hit' : 'miss');
  const isMiss = !!g?.stampMiss;          // genuine red only
  const called = tier === 'ON_READ';      // top outcome landed
  const exact = !!verdict?.scoreline?.exact;
  const lean = { HOME: s.home_team, DRAW: 'Draw', AWAY: s.away_team }[s.predicted_outcome];
  const leanP = { HOME: s.prob_home, DRAW: s.prob_draw, AWAY: s.prob_away }[s.predicted_outcome];
  const ft = `${s.ft_home_goals ?? s.home_goals}–${s.ft_away_goals ?? s.away_goals}`;
  const firstMiss = isMiss && stats && (stats.total - stats.correct) === 1;

  // ── verdict card (Seam "THE VERDICT") — every accent, glyph, headline and
  //    honest note comes straight off gradeRow (g), so the card can never
  //    contradict the ledger/receipt grading. 4 states → verdict accent:
  //    hit→green "Called it" · range→steel "Inside our range" ·
  //    amber→gold "Against the read" · miss→red "Missed". ─────────────────
  // Short verdict label + glyph + honest note + foot, keyed off the 4-state
  // grade (res). Matches Troy's the-call-{2,3} cards ("Called it" / "Missed");
  // the steel/amber states extend them for IN_RANGE / AGAINST so a result we
  // priced is never stamped red. The honest detail lives in the sub-line (the
  // grade's own blurb), so the big label stays one tight word/phrase.
  const V_LABEL = { hit: 'Called it', range: 'Inside our range', amber: 'Against the read', miss: 'Missed' };
  const V_GLYPH = { hit: '✓', range: '≈', amber: '±', miss: '✕' };
  const V_FOOT = {
    hit: 'Filed before kickoff · graded in public.',
    range: 'The result we priced — on the record.',
    amber: 'Against our read — on the record anyway.',
    miss: 'On the record anyway — we grade every call.',
  };
  const V_TONE_VC = { green: 'var(--green)', steel: 'var(--steel)', amber: 'var(--gold)', red: 'var(--red)', gold: 'var(--gold)' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const md = new Date(s.match_date);
  const verdictCard = {
    kicker: 'THE VERDICT · WORLD CUP 2026',
    home: s.home_team, away: s.away_team,
    codeH: abbr(s.home_team), codeA: abbr(s.away_team),
    meta: `${md.getUTCDate()} ${MON[md.getUTCMonth()]} ${md.getUTCFullYear()}`,
    ft,
    predScore: verdict?.scoreline?.predicted ? String(verdict.scoreline.predicted).replace('-', '–') : null,
    brier: Number(s.brier_score).toFixed(2),
    glyph: V_GLYPH[res] || '•',
    verdict: V_LABEL[res] || 'Settled',
    note: g?.blurb || `We said ${lean} (${pct(leanP)}). It finished ${ft}.`,
    footNote: V_FOOT[res] || 'Filed before kickoff · graded in public.',
    vc: V_TONE_VC[g?.tone] || 'var(--ox)',
    hIso: iso(s.home_team), aIso: iso(s.away_team),
  };

  const items = [
    { lab: `CALL — ${lean === 'Draw' ? 'DRAW' : abbr(lean) + ' WIN'}`, val: pct(leanP), res },
    ...(isMiss ? [{ sub: firstMiss ? 'our first genuine miss. it stays on the receipt.' : 'a genuine miss. it stays on the receipt.' }]
      : !called && g?.blurb ? [{ sub: g.blurb.toLowerCase() }] : []),
    ...(verdict?.scoreline ? [{ lab: `SCORELINE ${verdict.scoreline.predicted}`, val: pct(verdict.scoreline.predictedProb), res: exact ? 'hit' : 'range' },
      exact ? { sub: 'top of our grid · exact hit' } : { sub: `actual ${verdict.scoreline.actual}${verdict.scoreline.rankInTop ? ` — sat #${verdict.scoreline.rankInTop} in our grid` : ' — outside our top grid'}` }] : []),
    ...((verdict?.marketCalls || []).map(mc => ({ lab: mc.label.toUpperCase(), val: pct(mc.prob), res: mc.hit ? 'hit' : 'miss' }))),
  ];
  const he = flagEmoji(s.home_team), ae = flagEmoji(s.away_team);

  await withPage(async (page) => {
    await page.evaluate((d) => window.renderVerdict(d), verdictCard);
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#verdict')).screenshot({ path: path.join(OUT, 'match-verdict.png') });

    await page.evaluate((d) => window.renderVerdictIG(d), verdictCard);
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#verdict-ig')).screenshot({ path: path.join(OUT, 'match-verdict-ig-raw.png') });

    await page.evaluate((r) => window.renderReceipt(r), {
      title: `${he} ${s.home_team} v ${s.away_team} ${ae}`,
      ft,
      kicker: 'MATCH RECEIPT · WORLD CUP 2026',
      meta: `${new Date(s.match_date).toISOString().slice(0, 10).toUpperCase()} · LOCKED BEFORE KICKOFF`,
      items,
      brier: Number(s.brier_score).toFixed(4),
      stampText: g?.stampText || 'SETTLED',
      stampTone: stampClassOf(g, called),
      stampMiss: isMiss,
      hIso: iso(s.home_team), aIso: iso(s.away_team),
    });
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#receipt-stage')).screenshot({ path: path.join(OUT, 'match-receipt.png') });
  });

  // IG-native finishing (exact 1080×1350); local machines without ffmpeg
  // fall back to the raw render so previews still work.
  const { execFileSync } = await import('child_process');
  const { copyFileSync } = await import('fs');
  const finish = (src_, dst) => {
    try {
      execFileSync('ffmpeg', ['-y', '-i', path.join(OUT, src_),
        '-vf', 'scale=1080:1350:flags=lanczos,unsharp=5:5:0.45,eq=contrast=1.05:saturation=1.06',
        path.join(OUT, dst)], { stdio: 'pipe' });
    } catch {
      copyFileSync(path.join(OUT, src_), path.join(OUT, dst));
      console.warn(`ffmpeg unavailable — ${dst} is the raw render`);
    }
  };
  finish('match-verdict-ig-raw.png', 'match-verdict-ig.png');
  finish('match-receipt.png', 'match-receipt-ig.png');

  // evening-voice captions, platform-adapted. The match STORY — how the
  // game met or broke our call, in our voice — leads when the engine
  // produced one (it always does for a locked WC fixture). It already
  // states the call + what happened + the honest framing, so it replaces
  // the old hit/miss line rather than stacking on top of it.
  const story = verdict?.story?.text || null;
  const missLine = firstMiss
    ? 'our first missed call, printed in the same font as the wins.'
    : 'missed — printed in the same font as the wins.';
  const marketBits = (verdict?.marketCalls || []).filter(mc => mc.hit).map(mc => `${mc.label} ✓`).join(' · ');
  const body = story || (called
    ? `We said ${lean} (${pct(leanP)}) — and that’s how it went.${exact ? ` We had ${verdict.scoreline.actual} as the most likely score before kickoff, too.` : ''}`
    : isMiss
      ? `We said ${lean} (${pct(leanP)}). It finished ${ft} — ${missLine}`
      : `We said ${lean} (${pct(leanP)}). It finished ${ft} — ${g?.blurb ? g.blurb.toLowerCase() : 'the result sat inside our range.'}${exact ? ` And we had ${verdict.scoreline.actual} as our most likely score.` : ''}`);
  // The exact-scoreline credibility note still earns its place on a miss
  // (the story explains the outcome; this adds "we still had the score").
  const scorelineNote = (!called && exact)
    ? `The scoreline, though: ${verdict.scoreline.actual} was the top of our grid before kickoff (${pct(verdict.scoreline.predictedProb)}).`
    : null;
  const caption = [
    `Tonight: ${he} ${s.home_team} ${ft} ${s.away_team} ${ae}`,
    '',
    body,
    ...(scorelineNote ? ['', scorelineNote] : []),
    ...(marketBits ? ['', marketBits] : []),
    '',
    stats ? `World Cup so far: ${stats.correct} of ${stats.total} winners called.` : '',
    'Every call locked before kickoff, graded in public.',
    'oddyessa.com',
  ].filter(l => l !== null).join('\n');

  const tags = buildHashtags([[s.home_team, s.away_team]]);
  // X is 280 chars — lead with the first sentence of the story (the
  // "what happened" line), then trim progressively until it fits.
  const firstSentence = (t) => (t.split(/(?<=\.)\s+/)[0] || t).trim();
  const xBody = story
    ? firstSentence(story)
    : (called ? `Winner ✓ called — ${lean} ${pct(leanP)}.`
      : isMiss ? `The call missed — we said ${lean} ${pct(leanP)}. Printed anyway.`
      : `We said ${lean} ${pct(leanP)}. The result sat inside our range.`);
  let xCap = [
    `Tonight: ${he} ${abbr(s.home_team)} ${ft} ${abbr(s.away_team)} ${ae}`,
    '',
    xBody,
    '',
    'Receipts attached — full reasoning in bio.',
    '',
    tags.x,
  ].join('\n');
  if (xCap.length > 278) xCap = [`Tonight: ${he} ${abbr(s.home_team)} ${ft} ${abbr(s.away_team)} ${ae}`, '', xBody, '', tags.x].join('\n');
  if (xCap.length > 278) xCap = `Tonight: ${abbr(s.home_team)} ${ft} ${abbr(s.away_team)} — ${called ? 'called ✓' : isMiss ? 'the call missed, printed anyway' : 'inside our range'}${exact ? ' · exact score ✓' : ''}. Receipts attached.\n\n${tags.x}`;

  writeFileSync(path.join(OUT, 'match.json'), JSON.stringify({
    caption: caption + '\n\n' + tags.tg,
    captionX: xCap,
    hashtagsIG: tags.ig,
    images: ['match-verdict.png', 'match-receipt.png'],
    imagesIG: ['match-verdict-ig.png', 'match-receipt-ig.png'],
  }, null, 2));
  console.log(`match receipt generated for ${externalId}: ${res}${exact ? ' + exact scoreline' : ''}`);
}

// ─── pre-match call card (posted ~3h before kickoff) ────────────────
//   node generate.mjs prematch apf_1489370
async function generatePrematch(externalId) {
  if (!externalId) { console.error('usage: node generate.mjs prematch <external_id>'); process.exit(1); }
  const up = await getJson(`${API}/fixtures/upcoming`);
  let f = (up.fixtures || []).find(x => x.id === externalId);
  if (!f) {
    const all = await getJson(`${API}/fixtures/all`);
    f = (all.fixtures || []).find(x => x.id === externalId);
  }
  if (!f?.probability?.probabilities) {
    writeFileSync(path.join(OUT, 'prematch.json'), JSON.stringify({ skip: true, reason: `${externalId} has no live probabilities` }));
    console.log(`${externalId}: no probabilities — pre-match post skipped`);
    return;
  }
  // the analysis payload carries the plain-words reasoning + scoreline grid
  let p = f.probability;
  try {
    const a = await getJson(`${API}/analysis/${externalId}`);
    if (a?.probability?.probabilities) p = a.probability;
  } catch { /* fixture-level probabilities are enough */ }

  const home = f.homeTeam.name, away = f.awayTeam.name;
  const { home: ph, draw: pd, away: pa } = p.probabilities;
  const pick = ph >= pd && ph >= pa ? home : (pa >= pd ? away : 'Draw');
  const pickPct = pick === home ? ph : pick === away ? pa : pd;
  const risk = p.riskLevel || 'MEDIUM';
  const top = p.topScorelines?.[0] || null;
  const pickSide = pick === home ? 'home' : pick === away ? 'away' : 'draw';

  // Reasons, in honesty order: the strongest backing line, then the
  // strongest counter (the X card shows exactly these two), then the
  // value flag when the books disagree with the model, then more backing.
  const all = (p.reasoning?.reasons || []).filter(r => r.text && r.key !== 'goals');
  const backing = all.filter(r => r.favors === pickSide);
  const counter = all.filter(r => r.favors !== pickSide && r.favors !== 'even');
  const reasons = [];
  if (backing[0]) reasons.push({ text: backing[0].text });
  if (counter[0]) reasons.push({ text: counter[0].text });
  const edges = p.valueEdges || {};
  const [edgeKey, edgeVal] = Object.entries(edges).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] || [null, 0];
  if (edgeKey && edgeVal >= 5) {
    const edgeName = { home, draw: 'the draw', away }[edgeKey];
    reasons.push({ text: `Value flag: the books underrate ${edgeName} by ${Math.round(edgeVal)} points.` });
  }
  if (backing[1]) reasons.push({ text: backing[1].text });
  if (!reasons.length && p.reasoning?.headline) reasons.push({ text: p.reasoning.headline });

  const hoursToKo = Math.max(1, Math.round((new Date(f.date) - Date.now()) / 3600000));
  const cardData = {
    kicker: `THE CALL · KICKS OFF IN ~${hoursToKo}H`,
    home, away,
    ko: `${fmtTime(f.date)} · WORLD CUP 2026`,
    pick, pickPct, risk,
    probs: { home: ph, draw: pd, away: pa },
    homeAbbr: abbr(home), awayAbbr: abbr(away),
    reasons,
    scoreline: top?.score || null, scorelinePct: top?.probability || null,
    hIso: iso(home), aIso: iso(away),
  };

  await withPage(async (page) => {
    await page.evaluate((d) => window.renderPrematch(d), cardData);
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#prematch')).screenshot({ path: path.join(OUT, 'prematch-x.png') });
    await page.evaluate((d) => window.renderPrematchIG(d), cardData);
    await page.evaluate(() => window.imagesReady());
    await (await page.$('#prematch-ig')).screenshot({ path: path.join(OUT, 'prematch-ig-raw.png') });
  });

  const { execFileSync } = await import('child_process');
  const { copyFileSync } = await import('fs');
  try {
    execFileSync('ffmpeg', ['-y', '-i', path.join(OUT, 'prematch-ig-raw.png'),
      '-vf', 'scale=1080:1350:flags=lanczos,unsharp=5:5:0.45,eq=contrast=1.05:saturation=1.06',
      path.join(OUT, 'prematch-ig.png')], { stdio: 'pipe' });
  } catch {
    copyFileSync(path.join(OUT, 'prematch-ig-raw.png'), path.join(OUT, 'prematch-ig.png'));
    console.warn('ffmpeg unavailable — prematch-ig.png is the raw render');
  }

  const he = flagEmoji(home), ae = flagEmoji(away);
  const riskLine = RISK_PLAIN[risk] || '';
  const caption = [
    `${he} ${home} v ${away} ${ae} — ${fmtTime(f.date)}`,
    '',
    `Our call: ${pick === 'Draw' ? 'Draw' : pick} (${pct(pickPct)})${riskLine ? ` — ${riskLine}` : ''}`,
    `${abbr(home)} ${pct(ph)} · draw ${pct(pd)} · ${abbr(away)} ${pct(pa)}`,
    '',
    'Why:',
    ...reasons.slice(0, 3).map(r => `• ${r.text}`),
    ...(top ? ['', `Most likely score: ${top.score} (${pct(top.probability)})`] : []),
    '',
    'The forecast locks 10 minutes before kickoff — the locked call is what we grade ourselves on, in public.',
    'oddyessa.com',
  ].join('\n');

  const tags = buildHashtags([[home, away]]);
  let xCap = [
    `${he} ${abbr(home)} v ${abbr(away)} ${ae} · ${fmtTime(f.date)}`,
    '',
    `Our call: ${pick === 'Draw' ? 'Draw' : pick} ${pct(pickPct)}${risk === 'HIGH' ? ' (coin flip)' : ''}`,
    reasons[0] ? `Why: ${reasons[0].text}` : null,
    top ? `Most likely: ${top.score}` : null,
    '',
    'Locks 10 min before KO — graded after. Full reasoning in bio.',
    '',
    tags.x,
  ].filter(l => l !== null).join('\n');
  if (xCap.length > 278) xCap = `${he} ${abbr(home)} v ${abbr(away)} ${ae} · ${fmtTime(f.date)}\n\nOur call: ${pick === 'Draw' ? 'Draw' : pick} ${pct(pickPct)}${risk === 'HIGH' ? ' (coin flip)' : ''}${top ? ` · most likely ${top.score}` : ''}\n\nLocks 10 min before KO. Reasoning in bio.\n\n${tags.x}`;

  writeFileSync(path.join(OUT, 'prematch.json'), JSON.stringify({
    caption: caption + '\n\n' + tags.tg,
    captionX: xCap,
    hashtagsIG: tags.ig,
    images: ['prematch-x.png'],
    imagesIG: ['prematch-ig.png'],
  }, null, 2));
  console.log(`prematch generated: ${home} v ${away} — ${pick} ${pct(pickPct)} (${risk})`);
}

const mode = process.argv[2];
if (mode === 'ledger') await generateLedger();
else if (mode === 'picks') await generatePicks();
else if (mode === 'match') await generateMatch(process.argv[3]);
else if (mode === 'prematch') await generatePrematch(process.argv[3]);
else { console.error('usage: node generate.mjs ledger|picks|match <id>|prematch <id>'); process.exit(1); }
