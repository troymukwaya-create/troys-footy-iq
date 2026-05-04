// ─── MODEL LOCK & KILL SWITCH ───────────────────────────────────────
// Production safety controls for demo and live deployment.
//
// Model Lock:  Freezes optimization/promotion so predictions stay stable.
// Kill Switch: Falls back to pure Poisson if anything goes wrong.
//
// These are IN-MEMORY flags for zero-latency decisions.
// They can be toggled via API during a live demo.

// ─── State ──────────────────────────────────────────────────────────
let _modelLocked = false;
let _killSwitchActive = false;
let _demoMode = false;
let _lockReason = '';
let _killSwitchReason = '';
let _lockTimestamp = null;
let _killSwitchTimestamp = null;

// ─── Auto-trigger conditions ────────────────────────────────────────
let _apiFailureCount = 0;
let _invalidDataCount = 0;
const API_FAILURE_THRESHOLD = 3;    // 3 consecutive failures → kill switch
const INVALID_DATA_THRESHOLD = 5;   // 5 invalid data events → kill switch

// ═══════════════════════════════════════════════════════════════════
// MODEL LOCK — prevents optimization & promotion
// ═══════════════════════════════════════════════════════════════════

export function lockModel(reason = 'Manual lock') {
  _modelLocked = true;
  _lockReason = reason;
  _lockTimestamp = new Date().toISOString();
  console.log(`[MODEL LOCK] 🔒 Model LOCKED: ${reason}`);
}

export function unlockModel() {
  _modelLocked = false;
  _lockReason = '';
  _lockTimestamp = null;
  console.log('[MODEL LOCK] 🔓 Model UNLOCKED');
}

export function isModelLocked() {
  return _modelLocked;
}

export function getLockStatus() {
  return {
    locked: _modelLocked,
    reason: _lockReason,
    lockedAt: _lockTimestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════
// KILL SWITCH — falls back to pure Poisson, serves cached data
// ═══════════════════════════════════════════════════════════════════

export function activateKillSwitch(reason = 'Manual activation') {
  _killSwitchActive = true;
  _killSwitchReason = reason;
  _killSwitchTimestamp = new Date().toISOString();
  console.error(`[KILL SWITCH] ⛔ ACTIVATED: ${reason}`);
}

export function deactivateKillSwitch() {
  _killSwitchActive = false;
  _killSwitchReason = '';
  _killSwitchTimestamp = null;
  _apiFailureCount = 0;
  _invalidDataCount = 0;
  console.log('[KILL SWITCH] ✅ Deactivated');
}

export function isKillSwitchActive() {
  return _killSwitchActive;
}

export function getKillSwitchStatus() {
  return {
    active: _killSwitchActive,
    reason: _killSwitchReason,
    activatedAt: _killSwitchTimestamp,
    counters: {
      apiFailures: _apiFailureCount,
      invalidData: _invalidDataCount,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-TRIGGER — monitors failure conditions
// ═══════════════════════════════════════════════════════════════════

/**
 * Call when an API request fails. After N consecutive failures,
 * automatically activates kill switch.
 */
export function recordApiFailure(source) {
  _apiFailureCount++;
  console.warn(`[KILL SWITCH] API failure recorded (${source}) — count: ${_apiFailureCount}`);
  if (_apiFailureCount >= API_FAILURE_THRESHOLD && !_killSwitchActive) {
    activateKillSwitch(`Auto: ${_apiFailureCount} consecutive API failures (${source})`);
  }
}

/**
 * Call when API succeeds — resets failure counter.
 */
export function recordApiSuccess() {
  _apiFailureCount = 0;
}

/**
 * Call when invalid data is detected. After N events,
 * automatically activates kill switch.
 */
export function recordInvalidData(detail) {
  _invalidDataCount++;
  console.warn(`[KILL SWITCH] Invalid data: ${detail} — count: ${_invalidDataCount}`);
  if (_invalidDataCount >= INVALID_DATA_THRESHOLD && !_killSwitchActive) {
    activateKillSwitch(`Auto: ${_invalidDataCount} invalid data events detected`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEMO MODE — enables precomputed prediction serving
// ═══════════════════════════════════════════════════════════════════

export function enableDemoMode(reason = 'Manual') {
  _demoMode = true;
  lockModel('Demo mode enabled');
  console.log(`[DEMO MODE] 🎯 ENABLED: ${reason}`);
}

export function disableDemoMode() {
  _demoMode = false;
  console.log('[DEMO MODE] Demo mode disabled');
}

export function isDemoMode() {
  return _demoMode;
}

// ═══════════════════════════════════════════════════════════════════
// COMBINED STATUS
// ═══════════════════════════════════════════════════════════════════

export function getSystemSafetyStatus() {
  return {
    modelLock: getLockStatus(),
    killSwitch: getKillSwitchStatus(),
    demoMode: _demoMode,
    operational: !_killSwitchActive,
    mode: _killSwitchActive ? 'FAILSAFE'
      : _demoMode ? 'DEMO'
      : _modelLocked ? 'LOCKED'
      : 'LIVE',
  };
}

export default {
  lockModel, unlockModel, isModelLocked, getLockStatus,
  activateKillSwitch, deactivateKillSwitch, isKillSwitchActive, getKillSwitchStatus,
  recordApiFailure, recordApiSuccess, recordInvalidData,
  enableDemoMode, disableDemoMode, isDemoMode,
  getSystemSafetyStatus,
};
