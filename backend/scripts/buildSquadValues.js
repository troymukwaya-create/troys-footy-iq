// ─── SQUAD VALUE PRIOR BUILDER ──────────────────────────────────────
// One-time (re-runnable) aggregation of Transfermarkt market values into
// a compact static prior at data/squadValues.json. The raw Kaggle dump
// (~1GB of CSVs) stays OUT of the repo — only the ~100KB artifact ships.
//
// Source: https://www.kaggle.com/datasets/davidcariboo/player-scores
// (Transfermarkt data, CC0 public domain on Kaggle — the May-2026 license
// audit's "no scraping transfermarkt.de" ruling doesn't apply here.)
//
// Two bases, labeled per team in the output:
//   transfermarkt-national-team — official current-squad value from
//     national_teams.csv (119 teams) + top-26/top-5 player detail.
//   citizenship-top26 — for nations absent from national_teams.csv
//     (Curaçao, Haiti, Cape Verde, DR Congo, Ivory Coast…): sum of the
//     26 most valuable active players by country_of_citizenship.
//
// topPlayers (top 5 by value) is included so the lineups feature can do
// star-absence detection against confirmed XIs.
//
// Usage:
//   node scripts/buildSquadValues.js --src "/path/to/kaggle/archive"
//   node scripts/buildSquadValues.js --src "…" --out data/squadValues.json

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keep in sync with engine/nationalTeams.js norm() + NAME_ALIASES.
// Not imported: that module's import chain pulls in the DB layer.
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
const norm = (s) => {
  const base = String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(fc|national team|the)\b/g, '')
    .replace(/[^a-z]/g, '')
    .trim();
  return NAME_ALIASES[base] || base;
};

// Minimal RFC4180 parser — quoted fields, escaped quotes, newlines in quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const src = getArg('--src');
const out = getArg('--out') || join(__dirname, '..', 'data', 'squadValues.json');
if (!src) {
  console.error('Usage: node scripts/buildSquadValues.js --src "/path/to/kaggle/archive" [--out file.json]');
  process.exit(1);
}

const MIN_ACTIVE_SEASON = 2024;  // skip retired players carrying stale values
const SQUAD_N = 26;              // WC-2026 squad size
const TOP_PLAYERS = 5;
const MIN_FALLBACK_PLAYERS = 5;  // citizenship entries below this are noise

console.log('Reading national_teams.csv …');
const ntRows = parseCsv(readFileSync(join(src, 'national_teams.csv'), 'utf8'));

console.log('Reading players.csv …');
const playerRows = parseCsv(readFileSync(join(src, 'players.csv'), 'utf8'));

const active = playerRows.filter((p) =>
  Number(p.last_season) >= MIN_ACTIVE_SEASON && Number(p.market_value_in_eur) > 0);
console.log(`${playerRows.length} players total, ${active.length} active with a market value`);

const byNT = new Map();          // national_team_id -> players
const byCitizenship = new Map(); // country -> players
for (const p of active) {
  if (p.current_national_team_id) {
    const k = p.current_national_team_id;
    if (!byNT.has(k)) byNT.set(k, []);
    byNT.get(k).push(p);
  }
  if (p.country_of_citizenship) {
    const k = p.country_of_citizenship;
    if (!byCitizenship.has(k)) byCitizenship.set(k, []);
    byCitizenship.get(k).push(p);
  }
}

const val = (p) => Number(p.market_value_in_eur);
const summarize = (players) => {
  const sorted = [...players].sort((a, b) => val(b) - val(a));
  const top = sorted.slice(0, SQUAD_N);
  return {
    top26ValueEur: top.reduce((s, p) => s + val(p), 0),
    playersCounted: players.length,
    topPlayers: sorted.slice(0, TOP_PLAYERS).map((p) => ({
      name: p.name, marketValueEur: val(p), position: p.position || null,
    })),
  };
};

// Citizenship pools by norm key — the universal fallback. The dataset's
// national-team links are patchy (England/France/Spain have NO linked
// players and an empty total_market_value), so every team needs this net.
const citizenByKey = new Map();
for (const [country, players] of byCitizenship) {
  const key = norm(country);
  if (!key) continue;
  if (!citizenByKey.has(key)) citizenByKey.set(key, { country, players: [] });
  citizenByKey.get(key).players.push(...players);
}

const MIN_SQUAD_DETAIL = 10; // below this, the linked squad is too thin to trust

const teams = {};
for (const t of ntRows) {
  const key = norm(t.name);
  if (!key) continue;
  const official = Number(t.total_market_value) || null;
  const squad = byNT.has(t.national_team_id) ? summarize(byNT.get(t.national_team_id)) : null;
  const citizen = citizenByKey.has(key) ? summarize(citizenByKey.get(key).players) : null;
  const squadOk = squad && squad.playersCounted >= MIN_SQUAD_DETAIL;
  const detail = squadOk ? squad : (citizen ?? squad);
  teams[key] = {
    displayName: t.name,
    method: 'transfermarkt-national-team',
    squadValueEur: official ?? (squadOk ? squad.top26ValueEur : null)
      ?? citizen?.top26ValueEur ?? squad?.top26ValueEur ?? null,
    valueBasis: official ? 'official' : (squadOk ? 'squad-top26'
      : citizen ? 'citizenship-top26' : squad ? 'squad-top26' : 'none'),
    detailBasis: detail === squad ? 'squad' : 'citizenship',
    officialSquadValueEur: official,
    confederation: t.confederation || null,
    fifaRanking: Number(t.fifa_ranking) || null,
    squadSize: Number(t.squad_size) || null,
    averageAge: Number(t.average_age) || null,
    ...(detail || {}),
  };
}

let fallbacks = 0;
for (const [key, { country, players }] of citizenByKey) {
  if (teams[key]) continue;
  if (players.length < MIN_FALLBACK_PLAYERS) continue;
  teams[key] = {
    displayName: country,
    method: 'citizenship-top26',
    squadValueEur: summarize(players).top26ValueEur,
    valueBasis: 'citizenship-top26',
    detailBasis: 'citizenship',
    officialSquadValueEur: null,
    confederation: null, fifaRanking: null, squadSize: null, averageAge: null,
    ...summarize(players),
  };
  fallbacks++;
}

const sorted = Object.fromEntries(
  Object.entries(teams).sort(([, a], [, b]) => (b.squadValueEur || 0) - (a.squadValueEur || 0)));

const artifact = {
  source: 'Transfermarkt via Kaggle davidcariboo/player-scores (CC0)',
  sourceUrl: 'https://www.kaggle.com/datasets/davidcariboo/player-scores',
  generatedAt: new Date().toISOString(),
  notes: 'Static quality prior, NOT live data. Keys are engine norm() names. '
    + 'squadValueEur basis differs by method — see each team\'s method field. '
    + 'Regenerate by re-downloading the Kaggle dataset and re-running scripts/buildSquadValues.js.',
  teamCount: Object.keys(sorted).length,
  fallbackCount: fallbacks,
  teams: sorted,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(artifact, null, 1));
console.log(`Wrote ${out}: ${Object.keys(sorted).length} teams `
  + `(${ntRows.length} official, ${fallbacks} citizenship fallbacks)`);
