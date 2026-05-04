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
  apiResponseTime: { warning: 5000, critical: 10000 },  // ms
  dataFreshness: { warning: 24 * 60, critical: 48 * 60 }, // minutes
  predictionVolume: { warning: 0 }, // 0 predictions in 48h
};

// ─── In-memory API health counters ──────────────────────────────────
const apiHealth = {
  footballdata: { calls: 0, failures: 0, lastResponseTime: 0, lastCallAt: null },
  apisports: { calls: 0, failures: 0, lastResponseTime: 0, lastCallAt: null },
};

/**
 * Record an API call outcome for health monitoring.
 */
export function recordApiCall(source, success, responseTimeMs) {
  const tracker = apiHealth[source];
  if (!tracker) return;

  tracker.calls++;
  tracker.lastCallAt = Date.now();
  tracker.lastResponseTime = responseTimeMs;
  if (!success) tracker.failures++;

  // Alert on slow responses
  if (responseTimeMs > THRESHOLDS.apiResponseTime.critical) {
    createAlert('API_SLOW', 'CRITICAL', `${source} response time: ${responseTimeMs}ms`, { source, responseTimeMs });
  } else if (responseTimeMs > THRESHOLDS.apiResponseTime.warning) {
    createAlert('API_SLOW', 'WARNING', `${source} response time: ${responseTimeMs}ms`, { source, responseTimeMs });
  }

  // Alert on high failure rate (>30% in window)
  if (tracker.calls >= 10 && (tracker.failures / tracker.calls) > 0.30) {
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
 */
export async function createAlert(type, severity, message, context = null, source = 'monitor') {
  console.log(`[MONITOR] ${severity}: ${message}`);

  if (!isDbAvailable()) return;

  // Dedup: don't create identical alerts within 1 hour
  const existing = await safeQuery(
    `SELECT id FROM system_alerts
     WHERE alert_type = $1 AND severity = $2 AND created_at > NOW() - INTERVAL '1 hour'
     LIMIT 1`,
    [type, severity]
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

export default {
  recordApiCall,
  runHealthCheck,
  getRecentAlerts,
  acknowledgeAlert,
  createAlert,
  checkForModelDegradation,
};
