// ─── ELO BOOTSTRAP SERVICE ──────────────────────────────────────────
// Replays the full open dataset of international results (martj42 —
// every official international since 1872) through our own Elo updater
// to produce data-grounded ratings for the 2026 field, replacing the
// hand-tuned snapshot's weakest entries (debut teams were interpolated
// from FIFA ranks; the 2026-06-10 dry run showed e.g. Qatar overrated
// by ~90 while Jordan/Uzbekistan/New Zealand were underrated by 200+).
//
// Scale alignment: a from-1500 replay runs systematically hotter than
// the eloratings-anchored snapshot. Only Elo DIFFERENCES drive
// predictions, but mixed scales would poison cross-comparisons (form
// opponent adjustment, defaults), so applied values are re-centered by
// the median offset across tracked teams before persisting.
//
// Exposed as POST /api/admin/elo-bootstrap {action: dry-run|apply|reset}.

import axios from 'axios';
import { updateElo } from '../engine/eloLearning.js';
import { getElo, loadPersistedElo, resetEloOverrides, norm as normName } from '../engine/nationalTeams.js';
import { safeQuery, isDbAvailable } from '../db/index.js';

const CSV_URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const START_ELO = 1500;

// 2026 qualified field (+ a few likely friendly opponents we track).
export const TRACKED = [
  'Spain', 'Argentina', 'France', 'England', 'Brazil', 'Portugal', 'Netherlands', 'Croatia',
  'Germany', 'Morocco', 'Uruguay', 'Colombia', 'Switzerland', 'Senegal', 'Italy', 'Belgium',
  'Mexico', 'USA', 'Japan', 'Ecuador', 'Denmark', 'Iran', 'Austria', 'Nigeria', 'South Korea',
  'Egypt', 'Australia', 'Algeria', 'Ivory Coast', 'Norway', 'Bosnia & Herzegovina', 'Paraguay',
  'Canada', 'Sweden', 'Tunisia', 'Scotland', 'Czech Republic', 'Cameroon', 'Panama', 'Qatar',
  'South Africa', 'DR Congo', 'Uzbekistan', 'Saudi Arabia', 'Ghana', 'Iraq', 'Jordan',
  'Cape Verde', 'Costa Rica', 'Curacao', 'Haiti', 'New Zealand', 'Turkey',
];

// Dataset team name → our STRENGTH-table name (only where they differ).
const ALIASES = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Congo DR': 'DR Congo',
  'Czechia': 'Czech Republic',
  'Curaçao': 'Curacao',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
};

function importanceOf(tournament = '') {
  const t = tournament.toLowerCase();
  if (t === 'friendly') return 'friendly';
  if (t.includes('qualification') || t.includes('qualifier')) return 'qualifier';
  if (t.includes('nations league')) return 'nations_league';
  if (t.includes('fifa world cup')) return 'world_cup';
  if (t.includes('euro') || t.includes('copa am') || t.includes('african cup') ||
      t.includes('africa cup') || t.includes('asian cup') || t.includes('gold cup') ||
      t.includes('confederations')) return 'continental_final';
  return 'qualifier';
}

// Simple CSV line parser (this dataset has no quoted commas in practice;
// malformed lines are skipped rather than guessed at).
function parseLine(line) {
  const p = line.split(',');
  if (p.length < 9) return null;
  // date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
  const [date, home, away, hs, as, tournament] = p;
  const neutral = p[p.length - 1].trim().toUpperCase() === 'TRUE';
  const homeGoals = parseInt(hs, 10), awayGoals = parseInt(as, 10);
  if (!home || !away || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;
  return { date, home: home.trim(), away: away.trim(), homeGoals, awayGoals, tournament, neutral };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Team-name normalisation is shared with the engine (imported as normName)
// so persisted national_elo keys always match what getElo() looks up.

/**
 * Replay history → comparison vs snapshot → optionally persist (re-centered).
 * @param {{apply?: boolean}} opts
 */
export async function runEloBootstrap({ apply = false } = {}) {
  const res = await axios.get(CSV_URL, { timeout: 60000, responseType: 'text' });
  const lines = res.data.split('\n').slice(1).filter(Boolean);

  const elo = new Map();
  const played = new Map();
  const get = (name) => elo.get(name) ?? START_ELO;

  let replayed = 0;
  let latestMatchDate = '';
  for (const line of lines) {
    const m = parseLine(line);
    if (!m) continue;
    const upd = updateElo(get(m.home), get(m.away), m.homeGoals, m.awayGoals, {
      neutral: m.neutral,
      importance: importanceOf(m.tournament),
    });
    elo.set(m.home, upd.homeElo);
    elo.set(m.away, upd.awayElo);
    played.set(m.home, (played.get(m.home) || 0) + 1);
    played.set(m.away, (played.get(m.away) || 0) + 1);
    if (m.date > latestMatchDate) latestMatchDate = m.date;
    replayed++;
  }

  // Resolve dataset names → our names, build comparison for tracked teams.
  const resolved = new Map();
  for (const [dsName, value] of elo) {
    const ourName = ALIASES[dsName] || dsName;
    resolved.set(ourName, { elo: value, played: played.get(dsName) || 0 });
  }

  const rows = [];
  for (const name of TRACKED) {
    const r = resolved.get(name);
    if (!r) continue;
    rows.push({ name, replay: r.elo, snapshot: getElo(name), played: r.played });
  }
  const offset = Math.round(median(rows.map(r => r.replay - r.snapshot)));
  for (const r of rows) {
    r.rescaled = r.replay - offset;          // snapshot-scale value that preserves replay ordering
    r.diff = r.rescaled - r.snapshot;        // genuine disagreement after scale alignment
  }

  const summary = {
    replayed,
    latestMatchDate,
    scaleOffset: offset,
    teams: rows.length,
    meanAbsDiffAfterRescale: Math.round(rows.reduce((s, r) => s + Math.abs(r.diff), 0) / (rows.length || 1)),
  };

  if (!apply) return { action: 'dry-run', summary, rows };

  if (!isDbAvailable()) return { action: 'apply', error: 'database unavailable', summary };

  let stored = 0;
  for (const r of rows) {
    const ok = await safeQuery(
      `INSERT INTO national_elo (team_norm, team_name, elo, played, last_updated)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (team_norm) DO UPDATE SET
         elo = EXCLUDED.elo, team_name = EXCLUDED.team_name,
         played = EXCLUDED.played, last_updated = NOW()`,
      [normName(r.name), r.name, r.rescaled, r.played]
    );
    if (ok) stored++;
  }
  // Let the regular learning cycle re-apply the freshest results on top of
  // the bootstrapped baseline (the dataset may lag the last few days).
  await safeQuery(`DELETE FROM elo_processed_matches`);
  await loadPersistedElo();

  return { action: 'apply', summary: { ...summary, stored }, rows };
}

/** Remove all learned overrides — back to the hand-tuned snapshot. */
export async function resetEloBootstrap() {
  if (isDbAvailable()) {
    await safeQuery(`DELETE FROM national_elo`);
    await safeQuery(`DELETE FROM elo_processed_matches`);
  }
  resetEloOverrides();
  return { action: 'reset', ok: true };
}

export default { runEloBootstrap, resetEloBootstrap, TRACKED };
