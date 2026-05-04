// ─── MODEL VERSIONING SYSTEM ────────────────────────────────────────
// Manages model configuration versions with weights, calibration curves,
// and performance metrics. Enables promote/rollback and A/B comparison.
//
// Version naming: v1.0 (pure Poisson), v2.0 (initial hybrid), v2.1+ (tuned)
// Only ONE version is active at a time. New versions must improve metrics
// to be promoted.

import { safeQuery, isDbAvailable } from '../db/index.js';

// ─── Default Configuration (v1.0 baseline) ─────────────────────────
const SEED_VERSION = {
  version: 'v1.0',
  weights: {
    poisson: 0.50,
    form: 0.20,
    leagueCorrection: 0.10,
    market: 0.20,
  },
  calibrationCurves: null,      // Use hardcoded defaults
  leagueCorrections: null,       // No league-specific adjustments yet
  biasCorrections: null,         // No corrections yet
  config: {
    rho: -0.08,                  // Dixon-Coles correlation
    homeAdvantage: 1.10,
    minSampleForOptimization: 50,
    minImprovementPct: 0.5,
  },
};

// ─── In-memory cache of active version ──────────────────────────────
let _activeVersion = null;

/**
 * Get the currently active model version.
 * Caches in memory for fast access during inference.
 * Falls back to seed version if no DB or no active version found.
 *
 * @returns {Object} { version, weights, calibrationCurves, leagueCorrections, biasCorrections, config, metrics }
 */
export async function getActiveVersion() {
  if (_activeVersion) return _activeVersion;

  if (!isDbAvailable()) {
    _activeVersion = { ...SEED_VERSION, metrics: null, isActive: true };
    return _activeVersion;
  }

  try {
    const result = await safeQuery(
      `SELECT version, weights, calibration_curves, league_corrections,
              bias_corrections, config, metrics, promoted_at, created_at
       FROM model_versions
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (result?.rows?.[0]) {
      const row = result.rows[0];
      _activeVersion = {
        version: row.version,
        weights: row.weights || SEED_VERSION.weights,
        calibrationCurves: row.calibration_curves,
        leagueCorrections: row.league_corrections,
        biasCorrections: row.bias_corrections,
        config: { ...SEED_VERSION.config, ...(row.config || {}) },
        metrics: row.metrics,
        promotedAt: row.promoted_at,
        createdAt: row.created_at,
        isActive: true,
      };
    } else {
      // No active version — seed the initial one
      await seedInitialVersion();
      _activeVersion = { ...SEED_VERSION, metrics: null, isActive: true };
    }

    return _activeVersion;
  } catch (err) {
    console.error('[VERSIONING] Failed to load active version:', err.message);
    _activeVersion = { ...SEED_VERSION, metrics: null, isActive: true };
    return _activeVersion;
  }
}

/**
 * Create a new model version. Does NOT activate it.
 * Activation requires explicit promotion after validation.
 *
 * @param {Object} params
 * @param {string} params.parentVersion   - Version this was derived from
 * @param {Object} params.weights         - { poisson, form, leagueCorrection, market }
 * @param {Object} params.calibrationCurves
 * @param {Object} params.leagueCorrections
 * @param {Object} params.biasCorrections
 * @param {Object} params.config
 * @param {Object} params.metrics         - Performance metrics at creation time
 * @returns {string|null} New version ID
 */
export async function createVersion({
  parentVersion,
  weights,
  calibrationCurves = null,
  leagueCorrections = null,
  biasCorrections = null,
  config = null,
  metrics = null,
}) {
  if (!isDbAvailable()) return null;

  // Auto-generate version number
  const newVersion = await generateNextVersion(parentVersion);
  if (!newVersion) return null;

  try {
    const result = await safeQuery(
      `INSERT INTO model_versions
        (version, parent_version, weights, calibration_curves, league_corrections,
         bias_corrections, config, metrics, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
      [
        newVersion,
        parentVersion || null,
        JSON.stringify(weights),
        calibrationCurves ? JSON.stringify(calibrationCurves) : null,
        leagueCorrections ? JSON.stringify(leagueCorrections) : null,
        biasCorrections ? JSON.stringify(biasCorrections) : null,
        config ? JSON.stringify(config) : null,
        metrics ? JSON.stringify(metrics) : null,
      ]
    );

    const created = result?.rows?.[0]?.version;
    if (created) {
      console.log(`[VERSIONING] Created version ${created} (parent: ${parentVersion || 'none'})`);
    }
    return created || null;
  } catch (err) {
    console.error('[VERSIONING] Create failed:', err.message);
    return null;
  }
}

/**
 * Promote a version to active. Deactivates all other versions.
 * Should only be called after validating the version improves performance.
 *
 * @param {string} version - Version to promote
 * @returns {boolean} Success
 */
export async function promoteVersion(version) {
  if (!isDbAvailable()) return false;

  try {
    // Deactivate all
    await safeQuery(`UPDATE model_versions SET is_active = false WHERE is_active = true`);

    // Activate target
    const result = await safeQuery(
      `UPDATE model_versions
       SET is_active = true, promoted_at = NOW()
       WHERE version = $1
       RETURNING version`,
      [version]
    );

    if (result?.rows?.[0]) {
      console.log(`[VERSIONING] ✅ Promoted version ${version} to active`);
      _activeVersion = null; // Clear cache, will reload on next access
      return true;
    }

    console.warn(`[VERSIONING] Version ${version} not found for promotion`);
    return false;
  } catch (err) {
    console.error('[VERSIONING] Promote failed:', err.message);
    return false;
  }
}

/**
 * Rollback to the previous active version.
 * Finds the most recent version that isn't the current one.
 *
 * @returns {string|null} Version that was activated
 */
export async function rollbackVersion() {
  if (!isDbAvailable()) return null;

  try {
    // Get current active
    const current = await safeQuery(
      `SELECT version FROM model_versions WHERE is_active = true LIMIT 1`
    );
    const currentVersion = current?.rows?.[0]?.version;

    // Find previous version
    const prev = await safeQuery(
      `SELECT version FROM model_versions
       WHERE version != $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [currentVersion || '']
    );

    const prevVersion = prev?.rows?.[0]?.version;
    if (!prevVersion) {
      console.warn('[VERSIONING] No previous version to rollback to');
      return null;
    }

    await promoteVersion(prevVersion);
    console.log(`[VERSIONING] ⏪ Rolled back from ${currentVersion} to ${prevVersion}`);
    return prevVersion;
  } catch (err) {
    console.error('[VERSIONING] Rollback failed:', err.message);
    return null;
  }
}

/**
 * Compare two model versions side-by-side.
 *
 * @param {string} versionA
 * @param {string} versionB
 * @returns {Object} Comparison with metrics diff
 */
export async function compareVersions(versionA, versionB) {
  if (!isDbAvailable()) return null;

  try {
    const result = await safeQuery(
      `SELECT version, parent_version, weights, metrics, is_active, created_at, promoted_at
       FROM model_versions
       WHERE version IN ($1, $2)
       ORDER BY created_at ASC`,
      [versionA, versionB]
    );

    const versions = result?.rows || [];
    if (versions.length < 2) return null;

    const a = versions[0];
    const b = versions[1];

    const metricsA = a.metrics || {};
    const metricsB = b.metrics || {};

    return {
      versionA: {
        version: a.version,
        weights: a.weights,
        metrics: metricsA,
        isActive: a.is_active,
        createdAt: a.created_at,
      },
      versionB: {
        version: b.version,
        weights: b.weights,
        metrics: metricsB,
        isActive: b.is_active,
        createdAt: b.created_at,
      },
      comparison: {
        accuracyDiff: (metricsB.accuracy || 0) - (metricsA.accuracy || 0),
        brierDiff: (metricsB.avgBrierScore || 0) - (metricsA.avgBrierScore || 0),
        logLossDiff: (metricsB.avgLogLoss || 0) - (metricsA.avgLogLoss || 0),
        improved: (metricsB.avgLogLoss || 999) < (metricsA.avgLogLoss || 999),
      },
    };
  } catch (err) {
    console.error('[VERSIONING] Compare failed:', err.message);
    return null;
  }
}

/**
 * List all model versions with their metrics.
 *
 * @param {number} limit
 * @returns {Array}
 */
export async function listVersions(limit = 20) {
  if (!isDbAvailable()) return [SEED_VERSION];

  try {
    const result = await safeQuery(
      `SELECT version, parent_version, weights, metrics, is_active, promoted_at, created_at
       FROM model_versions
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result?.rows || [];
  } catch {
    return [];
  }
}

/**
 * Update the metrics for an existing version (e.g., after evaluation).
 */
export async function updateVersionMetrics(version, metrics) {
  if (!isDbAvailable()) return false;

  try {
    await safeQuery(
      `UPDATE model_versions SET metrics = $1 WHERE version = $2`,
      [JSON.stringify(metrics), version]
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Seed the initial v1.0 version if none exists.
 */
async function seedInitialVersion() {
  try {
    await safeQuery(
      `INSERT INTO model_versions (version, weights, config, is_active, promoted_at)
       VALUES ('v1.0', $1, $2, true, NOW())
       ON CONFLICT (version) DO NOTHING`,
      [
        JSON.stringify(SEED_VERSION.weights),
        JSON.stringify(SEED_VERSION.config),
      ]
    );
    console.log('[VERSIONING] Seeded initial version v1.0');
  } catch (err) {
    console.error('[VERSIONING] Seed failed:', err.message);
  }
}

/**
 * Generate next version number based on parent.
 * v1.0 → v1.1, v1.1 → v1.2, or v1.x → v2.0 for major changes.
 */
async function generateNextVersion(parentVersion) {
  if (!parentVersion) return 'v1.0';

  try {
    // Get the latest version number
    const result = await safeQuery(
      `SELECT version FROM model_versions ORDER BY created_at DESC LIMIT 1`
    );

    const latest = result?.rows?.[0]?.version || 'v1.0';
    const match = latest.match(/v(\d+)\.(\d+)/);
    if (!match) return 'v1.1';

    const major = parseInt(match[1]);
    const minor = parseInt(match[2]);

    return `v${major}.${minor + 1}`;
  } catch {
    return `v1.1`;
  }
}

/**
 * Invalidate the cached active version (call after external changes).
 */
export function invalidateCache() {
  _activeVersion = null;
}

export default {
  getActiveVersion,
  createVersion,
  promoteVersion,
  rollbackVersion,
  compareVersions,
  listVersions,
  updateVersionMetrics,
  invalidateCache,
  SEED_VERSION,
};
