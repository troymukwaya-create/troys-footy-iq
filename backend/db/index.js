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
let dbLastError = null;     // last connection error message — surfaced on /health
let reconnectTimer = null;  // background retry handle

/**
 * Check if the database is currently available.
 * Used by services to skip DB writes gracefully when DB is down.
 */
export function isDbAvailable() { return dbAvailable; }

/** Last DB connection error, or null when healthy. Surfaced on /health for remote diagnosis. */
export function getDbError() { return dbLastError; }

// One connection attempt: connect, run the idempotent schema, release.
async function connectOnce() {
  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      await client.query(fs.readFileSync(schemaPath, 'utf-8'));
    } else {
      console.warn('⚠️  schema.sql not found at', schemaPath);
    }
  } finally {
    client.release();
  }
}

// ─── Initialize Database ────────────────────────────────────────────
// Connects once at boot. On failure it does NOT give up — it keeps retrying
// in the background so a slow-booting or just-restored DB self-heals without
// a manual redeploy. R3 Loudness: the failure is logged loud + put on /health.
export async function initDb() {
  if (!process.env.DATABASE_URL) {
    dbLastError = 'DATABASE_URL is not set';
    console.error('🔴 [FATAL] DATABASE_URL is not set — predictions will NOT be persisted.');
  }
  try {
    await connectOnce();
    dbAvailable = true;
    dbLastError = null;
    console.log('✅ Connected to PostgreSQL successfully.');
  } catch (err) {
    dbAvailable = false;
    dbLastError = err.message;
    console.error('🔴 [FATAL] Database connection FAILED:', err.message);
    console.error('   → predictions will NOT be stored until this is fixed. Retrying in the background…');
    scheduleReconnect();
    throw err; // preserve existing caller behaviour (server.js logs + continues)
  }
}

// Keep retrying every 15s until the DB answers, then flip availability on.
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    try {
      await connectOnce();
      dbAvailable = true;
      dbLastError = null;
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      console.log('✅ [DB] Reconnected to PostgreSQL — persistence is live again.');
    } catch (err) {
      dbLastError = err.message;
      console.warn('[DB] Reconnect attempt failed:', err.message);
    }
  }, 15000);
  if (reconnectTimer.unref) reconnectTimer.unref(); // don't keep the process alive just for this
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
