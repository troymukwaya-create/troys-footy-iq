#!/usr/bin/env node
// ─── STATSBOMB OPEN DATA INGESTION ───────────────────────────────────
//
// ⚠️  RESEARCH-ONLY — StatsBomb Open Data is licensed under the StatsBomb
//     Public Data User Agreement, which restricts use to research projects
//     and genuine interest in football analytics. It is NOT permitted in
//     a commercial live product (ads, affiliate, paid tiers).
//
//     Attribution required: "Data provided by StatsBomb" + logo where displayed.
//     See: https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf
//
// This script downloads StatsBomb open competitions and matches to local JSON
// files under `data/statsbomb/`. Used for backtesting and methodology articles
// only. Do NOT import from this dataset in services/ used by live routes.
//
// Usage:
//   node scripts/ingestStatsBombOpen.js list
//   node scripts/ingestStatsBombOpen.js fetch <competition_id> <season_id>
//   node scripts/ingestStatsBombOpen.js fetch-all  (everything available)
// ────────────────────────────────────────────────────────────────────

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'statsbomb');
const BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';

const http = axios.create({ timeout: 30_000 });

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchJson(url) {
  const res = await http.get(url);
  return res.data;
}

async function loadCompetitions() {
  const competitions = await fetchJson(`${BASE}/competitions.json`);
  await ensureDir(DATA_DIR);
  await fs.writeFile(
    path.join(DATA_DIR, 'competitions.json'),
    JSON.stringify(competitions, null, 2)
  );
  return competitions;
}

async function listCompetitions() {
  const competitions = await loadCompetitions();
  console.log(`\nStatsBomb Open Competitions (${competitions.length} entries):\n`);
  console.log('  ID    Season  Country         Competition              Gender');
  console.log('  ────  ──────  ──────────────  ───────────────────────  ──────');
  for (const c of competitions) {
    console.log(
      `  ${String(c.competition_id).padStart(4)}  ` +
      `${String(c.season_id).padStart(6)}  ` +
      `${(c.country_name || '').padEnd(14).slice(0, 14)}  ` +
      `${(c.competition_name || '').padEnd(23).slice(0, 23)}  ` +
      `${c.competition_gender || ''}`
    );
  }
  console.log(`\nSaved to: ${path.join(DATA_DIR, 'competitions.json')}`);
}

async function fetchCompetition(competitionId, seasonId) {
  console.log(`\nFetching matches for competition ${competitionId}, season ${seasonId}...`);
  const matches = await fetchJson(`${BASE}/matches/${competitionId}/${seasonId}.json`);
  const dir = path.join(DATA_DIR, 'matches', String(competitionId));
  await ensureDir(dir);
  await fs.writeFile(
    path.join(dir, `${seasonId}.json`),
    JSON.stringify(matches, null, 2)
  );
  console.log(`  → ${matches.length} matches saved`);

  // Fetch lineups + events for each match
  const eventsDir = path.join(DATA_DIR, 'events');
  const lineupsDir = path.join(DATA_DIR, 'lineups');
  await ensureDir(eventsDir);
  await ensureDir(lineupsDir);

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    process.stdout.write(`\r  Events/lineups: ${i + 1}/${matches.length}`);
    try {
      const [events, lineups] = await Promise.all([
        fetchJson(`${BASE}/events/${m.match_id}.json`).catch(() => null),
        fetchJson(`${BASE}/lineups/${m.match_id}.json`).catch(() => null),
      ]);
      if (events) await fs.writeFile(path.join(eventsDir,  `${m.match_id}.json`), JSON.stringify(events));
      if (lineups) await fs.writeFile(path.join(lineupsDir, `${m.match_id}.json`), JSON.stringify(lineups));
    } catch (err) {
      console.warn(`\n  Match ${m.match_id} failed:`, err.message);
    }
  }
  console.log('\n  Done.');
}

async function fetchAll() {
  const competitions = await loadCompetitions();
  console.log(`\nFetching ALL ${competitions.length} competition/season pairs.`);
  console.log('  This may take a while.\n');
  for (const c of competitions) {
    try {
      await fetchCompetition(c.competition_id, c.season_id);
    } catch (err) {
      console.warn(`Failed ${c.competition_id}/${c.season_id}:`, err.message);
    }
  }
}

// ─── CLI dispatch ──────────────────────────────────────────────────
const [, , cmd, arg1, arg2] = process.argv;

(async () => {
  try {
    if (cmd === 'list') {
      await listCompetitions();
    } else if (cmd === 'fetch' && arg1 && arg2) {
      await fetchCompetition(parseInt(arg1, 10), parseInt(arg2, 10));
    } else if (cmd === 'fetch-all') {
      await fetchAll();
    } else {
      console.log('Usage:');
      console.log('  node scripts/ingestStatsBombOpen.js list');
      console.log('  node scripts/ingestStatsBombOpen.js fetch <competition_id> <season_id>');
      console.log('  node scripts/ingestStatsBombOpen.js fetch-all');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
