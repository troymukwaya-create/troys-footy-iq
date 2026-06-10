// ─── PRODUCTION MONITORING SERVICE ──────────────────────────────────
// Persistent monitoring replacing the in-memory-only calibrationTracker.
// Tracks model health, API health, data freshness, and model drift.
// Writes alerts to the system_alerts table — survives server restarts.

import { safeQuery, isDbAvailable } from '../db/index.js';
import { getActiveVersion } from '../engine/modelVersioning.js';

// ─── Alert Thresholds ───────────────────────────────────────────────
const THRESHOLDS = {
  accuracy: { warning: 38, critical: 30 },      // Rolling accuracy %
  brierScore: { warning: 0.20, critical: 0.25 }, // Brier score
  calibrationError: { warning: 0.12, critical: 0.18 },
  apiResponseTime: { warning: 5000, critical: 10000 },  // ms (default)
  dataFreshness: { warning: 24 * 60, critical: 48 * 60 }, // minutes
  predictionVolume: { warning: 0 }, // 0 predictions in 48h
};

// Per-source response-time thresholds. football-data.org's free tier
// routinely takes 5-8s on multi-competition queries — that's its normal,
// not an incident. Alerting at 5s generated a steady drip of WARNING
// noise on the CEO dashboard (one every result-ingestion cycle).
const API_TIME_THRESHOLDS = {
  footballdata: { warning: 10000, critical: 20000 },
  default: THRESHOLDS.apiResponseTime,
};

// API_SLOW is a slow-burn signal, not an incident — don't re-alert for
// the same source within 6h (createAlert's generic dedup is 1h).
const API_SLOW_DEDUP_HOURS = 6;

// ─── In-memory API health counters ──────────────────────────────────
const apiHealth = {
  footballdata: { calls: 0, failures: 0, lastResponseTime: 0, lastCallAt: null },
  apisports: { calls: 0, failures: 0, lastResponseTime: 0, lastCallAt: null },
  theodds: { calls: 0, failures: 0, lastResponseTime: 0, lastCallAt: null },
};

/**
 * Record an API call outcome for health monitoring.
 */
export function recordApiCall(source, success, responseTimeMs, endpoint = null) {
  // Persist to api_usage_log for the CEO dashboard quota gauges.
  // Fire-and-forget — never blocks or throws into the caller.
  if (isDbAvailable()) {
    safeQuery(
      `INSERT INTO api_usage_log (source, endpoint, success, response_time_ms)
       VALUES ($1, $2, $3, $4)`,
      [source, endpoint, !!success, Math.round(responseTimeMs) || null]
    ).catch(() => {});
  }

  const tracker = apiHealth[source];
  if (!tracker) return;

  tracker.calls++;
  tracker.lastCallAt = Date.now();
  tracker.lastResponseTime = responseTimeMs;
  if (!success) tracker.failures++;

  // Alert on slow responses (per-source thresholds, 6h dedup)
  const t = API_TIME_THRESHOLDS[source] || API_TIME_THRESHOLDS.default;
  if (responseTimeMs > t.critical) {
    createAlert('API_SLOW', 'CRITICAL', `${source} response time: ${responseTimeMs}ms`,
      { source, responseTimeMs }, 'monitor', API_SLOW_DEDUP_HOURS);
  } else if (responseTimeMs > t.warning) {
    createAlert('API_SLOW', 'WARNING', `${source} response time: ${responseTimeMs}ms`,
      { source, responseTimeMs }, 'monitor', API_SLOW_DEDUP_HOURS);
  }

  // Alert on high failure rate (>30% in window). Sample of 20+ so a brief
  // deploy-restart blip (a handful of failed calls during instance
  // switchover) can't fire a CRITICAL — that's what flagged 2026-06-10.
  if (tracker.calls >= 20 && (tracker.failures / tracker.calls) > 0.30) {
    createAlert('API_FAILURE_RATE', 'CRITICAL',
      `${source} failure rate: ${((tracker.failures / tracker.calls) * 100).toFixed(0)}% (${tracker.failures}/${tracker.calls})`,
      { source, failures: tracker.failures, total: tracker.calls }
    );
    // Reset counters after alert
    tracker.calls = 0;
    tracker.failures = 0;
  }
}

/**
 * Run a comprehensive health check of the entire system.
 * Called periodically by the scheduler and on-demand via API.
 *
 * @returns {Object} Full system health report
 */
export async function runHealthCheck() {
  const checks = {
    database: await checkDatabaseHealth(),
    modelAccuracy: await checkModelAccuracy(),
    dataFreshness: await checkDataFreshness(),
    predictionVolume: await checkPredictionVolume(),
    apiHealth: getApiHealthSummary(),
    modelVersion: null,
  };

  // Active model info
  try {
    const version = await getActiveVersion();
    checks.modelVersion = {
      version: version.version,
      weights: version.weights,
      hasMetrics: !!version.metrics,
    };
  } catch {
    checks.modelVersion = { version: 'unknown', error: true };
  }

  // Overall status
  const statuses = Object.values(checks).map(c => c?.status || 'unknown');
  let overallStatus = 'HEALTHY';
  if (statuses.includes('CRITICAL')) overallStatus = 'CRITICAL';
  else if (statuses.includes('WARNING')) overallStatus = 'WARNING';
  else if (statuses.includes('unknown')) overallStatus = 'DEGRADED';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Get recent alerts from the database.
 */
export async function getRecentAlerts(limit = 20, unacknowledgedOnly = false) {
  if (!isDbAvailable()) return [];

  const where = unacknowledgedOnly ? 'WHERE acknowledged = false' : '';
  const result = await safeQuery(
    `SELECT * FROM system_alerts ${where} ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result?.rows || [];
}

/**
 * Acknowledge an alert.
 */
export async function acknowledgeAlert(alertId) {
  if (!isDbAvailable()) return false;
  await safeQuery(`UPDATE system_alerts SET acknowledged = true WHERE id = $1`, [alertId]);
  return true;
}

/**
 * Create a system alert (persisted to database).
 * @param {number} dedupHours - suppress identical (type, severity) alerts
 *   created within this many hours (default 1).
 */
export async function createAlert(type, severity, message, context = null, source = 'monitor', dedupHours = 1) {
  console.log(`[MONITOR] ${severity}: ${message}`);

  if (!isDbAvailable()) return;

  // Dedup: don't create identical alerts within the dedup window
  const hours = Math.max(1, Number(dedupHours) || 1);
  const existing = await safeQuery(
    `SELECT id FROM system_alerts
     WHERE alert_type = $1 AND severity = $2 AND created_at > NOW() - ($3 || ' hours')::interval
     LIMIT 1`,
    [type, severity, hours]
  );

  if (existing?.rows?.length > 0) return; // Already alerted

  await safeQuery(
    `INSERT INTO system_alerts (alert_type, severity, message, context, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [type, severity, message, context ? JSON.stringify(context) : null, source]
  );
}

// ─── Individual Health Checks ───────────────────────────────────────

async function checkDatabaseHealth() {
  if (!isDbAvailable()) {
    return { status: 'CRITICAL', message: 'Database not connected' };
  }

  try {
    const start = Date.now();
    await safeQuery('SELECT 1');
    const latency = Date.now() - start;

    return {
      status: latency < 500 ? 'HEALTHY' : 'WARNING',
      latencyMs: latency,
      message: `Connected (${latency}ms)`,
    };
  } catch {
    return { status: 'CRITICAL', message: 'Database query failed' };
  }
}

async function checkModelAccuracy() {
  if (!isDbAvailable()) return { status: 'unknown', message: 'No database' };

  const result = await safeQuery(`
    SELECT
      COUNT(*)::int as n,
      ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
      ROUND(AVG(brier_score)::numeric, 4) as brier
    FROM model_performance
    WHERE created_at > NOW() - INTERVAL '14 days'
  `);

  const row = result?.rows?.[0];
  if (!row || parseInt(row.n) < 5) {
    return { status: 'unknown', message: `Insufficient data (${row?.n || 0} predictions in 14d)`, sampleSize: parseInt(row?.n || 0) };
  }

  const accuracy = parseFloat(row.accuracy);
  const brier = parseFloat(row.brier);

  let status = 'HEALTHY';
  if (accuracy < THRESHOLDS.accuracy.critical || brier > THRESHOLDS.brierScore.critical) {
    status = 'CRITICAL';
    await createAlert('ACCURACY_DROP', 'CRITICAL',
      `Rolling accuracy ${accuracy}% (threshold: ${THRESHOLDS.accuracy.critical}%), Brier: ${brier}`,
      { accuracy, brier, sampleSize: parseInt(row.n) }
    );
  } else if (accuracy < THRESHOLDS.accuracy.warning || brier > THRESHOLDS.brierScore.warning) {
    status = 'WARNING';
    await createAlert('ACCURACY_WARNING', 'WARNING',
      `Rolling accuracy ${accuracy}% approaching threshold, Brier: ${brier}`,
      { accuracy, brier }
    );
  }

  return { status, accuracy, brier, sampleSize: parseInt(row.n) };
}

async function checkDataFreshness() {
  if (!isDbAvailable()) return { status: 'unknown', message: 'No database' };

  const result = await safeQuery(
    `SELECT MAX(updated_at) as latest FROM fixtures WHERE status != 'FINISHED'`
  );

  const latest = result?.rows?.[0]?.latest;
  if (!latest) return { status: 'WARNING', message: 'No active fixtures found' };

  const ageMinutes = (Date.now() - new Date(latest).getTime()) / 60000;

  let status = 'HEALTHY';
  if (ageMinutes > THRESHOLDS.dataFreshness.critical) {
    status = 'CRITICAL';
    await createAlert('DATA_STALE', 'CRITICAL', `Fixture data is ${Math.round(ageMinutes / 60)}h old`, { ageMinutes });
  } else if (ageMinutes > THRESHOLDS.dataFreshness.warning) {
    status = 'WARNING';
  }

  return { status, lastUpdateAge: `${Math.round(ageMinutes)}m`, ageMinutes: Math.round(ageMinutes) };
}

async function checkPredictionVolume() {
  if (!isDbAvailable()) return { status: 'unknown', message: 'No database' };

  const result = await safeQuery(
    `SELECT COUNT(*)::int as n FROM predictions WHERE created_at > NOW() - INTERVAL '48 hours'`
  );

  const count = result?.rows?.[0]?.n || 0;

  if (count === 0) {
    await createAlert('NO_PREDICTIONS', 'WARNING', 'No predictions generated in 48 hours', { count });
    return { status: 'WARNING', count, message: 'No predictions in 48h' };
  }

  return { status: 'HEALTHY', count, message: `${count} predictions in last 48h` };
}

function getApiHealthSummary() {
  const summary = {};
  for (const [source, tracker] of Object.entries(apiHealth)) {
    const failureRate = tracker.calls > 0 ? (tracker.failures / tracker.calls) : 0;
    summary[source] = {
      status: failureRate > 0.30 ? 'CRITICAL' : failureRate > 0.10 ? 'WARNING' : 'HEALTHY',
      calls: tracker.calls,
      failures: tracker.failures,
      failureRate: parseFloat((failureRate * 100).toFixed(1)),
      lastResponseTime: tracker.lastResponseTime,
      lastCallAt: tracker.lastCallAt ? new Date(tracker.lastCallAt).toISOString() : null,
    };
  }
  return { status: 'HEALTHY', sources: summary };
}

/**
 * Check if the active model is performing worse than its parent.
 * Triggers auto-rollback if degradation detected.
 *
 * @returns {{ shouldRollback: boolean, reason: string }}
 */
export async function checkForModelDegradation() {
  if (!isDbAvailable()) return { shouldRollback: false, reason: 'No database' };

  const version = await getActiveVersion();
  if (!version.metrics?.avgLogLoss) return { shouldRollback: false, reason: 'No baseline metrics' };

  // Get recent performance (last 20 matches)
  const result = await safeQuery(`
    SELECT
      COUNT(*)::int as n,
      ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1) as accuracy,
      ROUND(AVG(log_loss)::numeric, 4) as avg_log_loss
    FROM model_performance mp
    JOIN predictions p ON mp.prediction_id = p.id
    WHERE p.model_version = $1
      AND mp.created_at > NOW() - INTERVAL '14 days'
  `, [version.version]);

  const row = result?.rows?.[0];
  if (!row || parseInt(row.n) < 15) {
    return { shouldRollback: false, reason: `Insufficient live data (${row?.n || 0}/15)` };
  }

  const liveLogLoss = parseFloat(row.avg_log_loss);
  const baselineLogLoss = version.metrics.avgLogLoss;

  // If live log loss is >10% worse than baseline → rollback
  const degradation = (liveLogLoss - baselineLogLoss) / baselineLogLoss;
  if (degradation > 0.10) {
    await createAlert('MODEL_DEGRADATION', 'CRITICAL',
      `Model ${version.version} degraded: live log loss ${liveLogLoss} vs baseline ${baselineLogLoss} (+${(degradation * 100).toFixed(1)}%)`,
      { version: version.version, liveLogLoss, baselineLogLoss, degradation, sampleSize: parseInt(row.n) }
    );
    return {
      shouldRollback: true,
      reason: `Live log loss ${liveLogLoss.toFixed(4)} is ${(degradation * 100).toFixed(1)}% worse than baseline ${baselineLogLoss.toFixed(4)}`,
    };
  }

  return { shouldRollback: false, reason: 'Model performing within tolerance' };
}

// ═══════════════════════════════════════════════════════════════════
// CEO DASHBOARD — COST + USAGE ACCOUNTING
// ═══════════════════════════════════════════════════════════════════

// Per-1M-token pricing (USD). Anthropic Claude Sonnet 4 reference rates.
// cached = prompt-cache read rate (~10% of input).
const CLAUDE_PRICING = {
  default:                    { input: 3.0, output: 15.0, cached: 0.30 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cached: 0.30 },
  'claude-3-5-haiku':         { input: 0.80, output: 4.0, cached: 0.08 },
};

/**
 * Record a Claude API call's token usage + cost. Fire-and-forget.
 * Call this right after every Anthropic request resolves.
 *
 * @param {Object} usage - { input_tokens, output_tokens, cache_read_input_tokens }
 * @param {string} model - model id (for pricing + audit)
 * @param {string} endpoint - logical call site ('ai_verdict', etc.)
 */
export function logApiCost(usage = {}, model = 'default', endpoint = null) {
  const price = CLAUDE_PRICING[model] || CLAUDE_PRICING.default;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cached = usage.cache_read_input_tokens || 0;
  const billableInput = Math.max(0, input - cached);

  const cost =
    (billableInput * price.input +
     cached * price.cached +
     output * price.output) / 1_000_000;

  if (isDbAvailable()) {
    safeQuery(
      `INSERT INTO api_cost_log (provider, model, input_tokens, output_tokens, cached_tokens, cost_usd, endpoint)
       VALUES ('anthropic', $1, $2, $3, $4, $5, $6)`,
      [model, input, output, cached, +cost.toFixed(6), endpoint]
    ).catch(() => {});
  }
  return cost;
}

/**
 * API quota usage per source for today + this month.
 * Powers the dashboard's quota progress bars.
 */
export async function getApiUsageStats() {
  if (!isDbAvailable()) return { sources: {}, available: false };

  const result = await safeQuery(`
    SELECT source,
      COUNT(*) FILTER (WHERE called_at >= CURRENT_DATE)::int                        AS today,
      COUNT(*) FILTER (WHERE called_at >= date_trunc('month', CURRENT_DATE))::int   AS month,
      COUNT(*) FILTER (WHERE called_at >= NOW() - INTERVAL '1 minute')::int         AS last_minute,
      COUNT(*) FILTER (WHERE NOT success AND called_at >= CURRENT_DATE)::int         AS failures_today,
      MAX(called_at) AS last_call
    FROM api_usage_log
    GROUP BY source
  `);

  const sources = {};
  for (const r of result?.rows || []) {
    sources[r.source] = {
      today: r.today, month: r.month, lastMinute: r.last_minute,
      failuresToday: r.failures_today, lastCall: r.last_call,
    };
  }
  return { sources, available: true };
}

/**
 * Claude spend today + this month. Powers the spend-vs-budget card.
 */
export async function getApiCostStats() {
  if (!isDbAvailable()) return { available: false };

  const result = await safeQuery(`
    SELECT
      COALESCE(SUM(cost_usd) FILTER (WHERE called_at >= CURRENT_DATE), 0)                      AS today_usd,
      COALESCE(SUM(cost_usd) FILTER (WHERE called_at >= date_trunc('month', CURRENT_DATE)), 0) AS month_usd,
      COUNT(*) FILTER (WHERE called_at >= CURRENT_DATE)::int                                    AS calls_today,
      COALESCE(SUM(cached_tokens), 0)::bigint                                                   AS cached_tokens_total,
      COALESCE(SUM(input_tokens + output_tokens), 0)::bigint                                    AS tokens_total
    FROM api_cost_log
  `);

  const row = result?.rows?.[0] || {};
  const cached = Number(row.cached_tokens_total || 0);
  const totalIn = Number(row.tokens_total || 0);
  return {
    available: true,
    todayUsd: +Number(row.today_usd || 0).toFixed(4),
    monthUsd: +Number(row.month_usd || 0).toFixed(4),
    callsToday: row.calls_today || 0,
    cacheHitRate: totalIn > 0 ? +((cached / totalIn) * 100).toFixed(1) : 0,
  };
}

/** Expose the in-memory API health summary (used by /api/admin/system). */
export function getApiHealth() {
  return getApiHealthSummary();
}

export default {
  recordApiCall,
  runHealthCheck,
  getRecentAlerts,
  acknowledgeAlert,
  createAlert,
  checkForModelDegradation,
  logApiCost,
  getApiUsageStats,
  getApiCostStats,
  getApiHealth,
};
