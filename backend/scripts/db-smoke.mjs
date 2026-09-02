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

await client.end();

if (missing.length) {
  console.error(`MISSING TABLES: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('schema OK');
