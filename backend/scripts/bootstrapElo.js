// ─── ELO BOOTSTRAP (CLI wrapper) ────────────────────────────────────
// Thin wrapper around services/eloBootstrap.js — same logic that powers
// POST /api/admin/elo-bootstrap.
//
// Usage:
//   node scripts/bootstrapElo.js            # dry run: comparison table only
//   node scripts/bootstrapElo.js --apply    # persist (needs DATABASE_URL)

import { runEloBootstrap } from '../services/eloBootstrap.js';

async function main() {
  const apply = process.argv.includes('--apply');

  if (apply) {
    const { initDb } = await import('../db/index.js');
    await initDb();
  }

  console.log('Fetching + replaying full international results history…');
  const result = await runEloBootstrap({ apply });

  console.log(`\nReplayed ${result.summary.replayed} matches (dataset through ${result.summary.latestMatchDate}).`);
  console.log(`Scale offset (replay − snapshot, median): ${result.summary.scaleOffset > 0 ? '+' : ''}${result.summary.scaleOffset}\n`);

  console.log('TEAM                        RESCALED  SNAPSHOT   DIFF   (matches)');
  console.log('─'.repeat(68));
  for (const r of result.rows) {
    console.log(
      `${r.name.padEnd(28)}${String(r.rescaled).padEnd(10)}${String(r.snapshot).padEnd(11)}` +
      `${(r.diff > 0 ? '+' : '') + r.diff}`.padEnd(7) + `(${r.played})`
    );
  }
  console.log('─'.repeat(68));
  console.log(`Mean |diff| after rescale: ${result.summary.meanAbsDiffAfterRescale} Elo over ${result.summary.teams} teams`);

  if (result.action === 'apply') {
    console.log(`\nPersisted ${result.summary.stored} ratings to national_elo.`);
    const { default: pool } = await import('../db/index.js');
    await pool.end();
  } else {
    console.log('\nDry run only. Use --apply (or the admin endpoint) to persist.');
  }
}

main().catch(e => { console.error('bootstrapElo failed:', e.message); process.exit(1); });
