import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/football',
  max: 10,                       // Connection pool size
  idleTimeoutMillis: 30000,      // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if DB is unreachable
  ...(isProduction && {
    ssl: { rejectUnauthorized: false }
  }),
});

// ─── DB Availability Tracking ───────────────────────────────────────
let dbAvailable = false;

/**
 * Check if the database is currently available.
 * Used by services to skip DB writes gracefully when DB is down.
 */
export function isDbAvailable() { return dbAvailable; }

// ─── Initialize Database ────────────────────────────────────────────
export async function initDb() {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL successfully.');
    dbAvailable = true;

    // Auto-run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      console.log('✅ Schema executed successfully.');
    } else {
      console.warn('⚠️  schema.sql not found at', schemaPath);
    }

    client.release();
  } catch (err) {
    dbAvailable = false;
    console.error('Failed to initialize database:', err.message);
    throw err; // Let caller handle (server.js catches and continues)
  }
}

// ─── Query Wrapper ──────────────────────────────────────────────────
let _queryCount = 0;
let _slowQueryCount = 0;

export const query = async (text, params) => {
  if (!dbAvailable) {
    throw new Error('Database not available');
  }
  _queryCount++;
  const start = Date.now();
  const result = await pool.query(text, params);
  const elapsed = Date.now() - start;
  if (elapsed > 500) {
    _slowQueryCount++;
    console.warn(`[DB] Slow query (${elapsed}ms): ${text.substring(0, 80)}...`);
  }
  return result;
};

// ─── Safe Query (non-throwing) ──────────────────────────────────────
// For background tasks that should never crash the server.
export async function safeQuery(text, params) {
  try {
    if (!dbAvailable) return null;
    return await pool.query(text, params);
  } catch (err) {
    console.error('[DB] Safe query failed:', err.message);
    return null;
  }
}

export const getClient = () => pool.connect();

// ─── Pool Health & Metrics ───────────────────────────────────────────
export function getDbMetrics() {
  return {
    available: dbAvailable,
    totalQueries: _queryCount,
    slowQueries: _slowQueryCount,
    poolTotal: pool.totalCount,
    poolIdle: pool.idleCount,
    poolWaiting: pool.waitingCount,
  };
}

// ─── Graceful Shutdown ─────────────────────────────────────────────
export async function closeDb() {
  try {
    await pool.end();
    dbAvailable = false;
    console.log('[DB] Connection pool closed.');
  } catch (err) {
    console.error('[DB] Error closing pool:', err.message);
  }
}

export default pool;
