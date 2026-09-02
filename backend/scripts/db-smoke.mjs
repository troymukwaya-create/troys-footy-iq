// Verifies DATABASE_URL is reachable and the schema applied.
// Usage: DATABASE_URL='...' node backend/scripts/db-smoke.mjs
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const REQUIRED = ['fixtures', 'predictions', 'model_performance', 'team_season_stats'];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let failed = false;
try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = REQUIRED.filter((t) => !present.has(t));

  console.log(`tables found: ${present.size}`);
  for (const t of REQUIRED) {
    const { rows: c } = present.has(t)
      ? await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)
      : { rows: [{ n: 0 }] };
    console.log(`  ${present.has(t) ? 'ok  ' : 'MISS'} ${t.padEnd(20)} rows=${c[0].n}`);
  }

  if (missing.length) {
    console.error(`MISSING TABLES: ${missing.join(', ')}`);
    failed = true;
  } else {
    console.log('schema OK');
  }
} catch (err) {
  // Print ONLY the message. Never the error object or its stack — the pg
  // Client holds the full DATABASE_URL and it can surface in either.
  console.error(`database check failed: ${err.message}`);
  failed = true;
} finally {
  await client.end().catch(() => {});
}

process.exit(failed ? 1 : 0);
