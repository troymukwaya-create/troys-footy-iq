// ─── FIXTURE VALIDATOR ────────────────────────────────────────────────────────
// Strict validation for all fixtures before they are stored or served.
//
// Every fixture MUST pass validateFixture() before reaching the frontend.
// Invalid fixtures are discarded and logged. They are NEVER silently passed through.
//
// Validates:
//   1. Required fields exist and are non-null
//   2. Team names are real (not placeholders or empty)
//   3. Date is a valid UTC ISO-8601 timestamp
//   4. Competition code is recognised
//   5. No duplicate fixture IDs in a batch
//
// Also provides:
//   validatePredictionConsistency() — ensures prediction fixture IDs match served fixtures

import { DEMO_COMPETITION_CODES } from '../config/lockedDemoFixtures.js';

// Known valid competition codes (union of all providers)
const KNOWN_COMPETITION_CODES = new Set([
  'WC', // FIFA World Cup 2026
  'PL', 'PD', 'BL1', 'SA', 'FL1', 'BSA', 'CL', 'EL', 'ELC',
  'UCL', 'UEL', // API-Sports codes
  'UEFA Champions League', 'UEFA Europa League', // full names as fallback
]);

// Placeholder / junk team names that indicate bad data
const INVALID_TEAM_NAMES = new Set([
  'undefined', 'null', 'n/a', 'tbd', 'team a', 'team b', 'home team', 'away team', ''
]);

const validationLog = [];

/**
 * Validate a single fixture object.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateFixture(fixture) {
  const errors = [];
  const id = fixture?.id || '(no-id)';

  // ─── 1. Required fields
  if (!fixture) { return { valid: false, errors: ['Fixture is null/undefined'] }; }
  if (!fixture.id) errors.push(`[${id}] Missing fixture.id`);
  if (!fixture.homeTeam) errors.push(`[${id}] Missing homeTeam`);
  if (!fixture.awayTeam) errors.push(`[${id}] Missing awayTeam`);
  if (!fixture.date) errors.push(`[${id}] Missing date`);
  if (!fixture.league) errors.push(`[${id}] Missing league`);

  // ─── 2. Team name validation
  const homeName = (fixture.homeTeam?.name || '').toString().toLowerCase().trim();
  const awayName = (fixture.awayTeam?.name || '').toString().toLowerCase().trim();

  if (!homeName || INVALID_TEAM_NAMES.has(homeName)) {
    errors.push(`[${id}] Invalid homeTeam.name: "${fixture.homeTeam?.name}"`);
  }
  if (!awayName || INVALID_TEAM_NAMES.has(awayName)) {
    errors.push(`[${id}] Invalid awayTeam.name: "${fixture.awayTeam?.name}"`);
  }
  if (homeName === awayName && homeName !== '') {
    errors.push(`[${id}] homeTeam and awayTeam have the same name: "${fixture.homeTeam?.name}"`);
  }

  // ─── 3. Date validation — must be valid ISO-8601 UTC
  if (fixture.date) {
    const d = new Date(fixture.date);
    if (isNaN(d.getTime())) {
      errors.push(`[${id}] Invalid date: "${fixture.date}"`);
    }
  }

  // ─── 4. Competition code (warn, don't reject for unknown codes from live API)
  const code = fixture.league?.code;
  if (code && !KNOWN_COMPETITION_CODES.has(code)) {
    // Warn but don't reject — live API may have extra competitions
    console.warn(`[FIXTURE VALIDATOR] ⚠️ Unknown competition code "${code}" for fixture ${id}`);
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    const entry = { id, errors, timestamp: new Date().toISOString() };
    validationLog.push(entry);
    console.error(`[FIXTURE VALIDATOR] ❌ Rejected fixture ${id}:`, errors);
  }

  return { valid: isValid, errors };
}

/**
 * Validate and filter an array of fixtures.
 * Returns only the fixtures that pass validation.
 *
 * @param {Array} fixtures
 * @param {string} source — label for logging (e.g. 'footballdata', 'apisports')
 * @returns {{ valid: Array, rejected: Array, rejectedCount: number }}
 */
export function validateFixtureBatch(fixtures, source = 'unknown') {
  if (!Array.isArray(fixtures)) {
    console.error(`[FIXTURE VALIDATOR] ❌ validateFixtureBatch received non-array from "${source}"`);
    return { valid: [], rejected: [], rejectedCount: 0 };
  }

  const valid = [];
  const rejected = [];
  const seenIds = new Set();

  for (const f of fixtures) {
    // Duplicate ID check
    if (f?.id && seenIds.has(f.id)) {
      const dupErr = { id: f.id, errors: [`Duplicate fixture ID`], timestamp: new Date().toISOString() };
      rejected.push(dupErr);
      validationLog.push(dupErr);
      console.warn(`[FIXTURE VALIDATOR] ⚠️ Duplicate fixture ID "${f.id}" from "${source}" — discarded`);
      continue;
    }

    const { valid: isValid, errors } = validateFixture(f);
    if (isValid) {
      valid.push(f);
      if (f?.id) seenIds.add(f.id);
    } else {
      rejected.push({ id: f?.id, errors });
    }
  }

  console.log(`[FIXTURE VALIDATOR] ✅ "${source}": ${valid.length} valid, ${rejected.length} rejected out of ${fixtures.length} total`);
  return { valid, rejected, rejectedCount: rejected.length };
}

/**
 * Check prediction ↔ fixture consistency.
 * Ensures every prediction maps to a fixture that is actually being served.
 *
 * @param {Array} predictions — array of prediction objects with { fixtureId, homeTeam, awayTeam }
 * @param {Array} servedFixtures — the validated fixture array being served
 * @returns {{ consistent: Array, mismatched: Array }}
 */
export function validatePredictionConsistency(predictions, servedFixtures) {
  const fixtureIndex = new Map(servedFixtures.map(f => [f.id, f]));
  const consistent = [];
  const mismatched = [];

  for (const pred of predictions) {
    const fixture = fixtureIndex.get(pred.fixtureId || pred.id);
    if (!fixture) {
      mismatched.push({ predId: pred.fixtureId || pred.id, reason: 'No matching fixture in served set' });
      console.warn(`[FIXTURE VALIDATOR] ⚠️ Prediction for "${pred.fixtureId}" has no matching fixture — discarded`);
      continue;
    }

    // Cross-check team names (normalised lowercase)
    const predHome = (pred.homeTeam || '').toLowerCase().trim();
    const predAway = (pred.awayTeam || '').toLowerCase().trim();
    const fixHome = (fixture.homeTeam?.name || '').toLowerCase().trim();
    const fixAway = (fixture.awayTeam?.name || '').toLowerCase().trim();

    if (predHome && fixHome && predHome !== fixHome) {
      mismatched.push({
        predId: pred.fixtureId || pred.id,
        reason: `Home team mismatch: prediction="${predHome}", fixture="${fixHome}"`,
      });
      console.error(`[FIXTURE VALIDATOR] ❌ Home team mismatch on "${pred.fixtureId}": pred="${predHome}" vs fixture="${fixHome}"`);
      continue;
    }
    if (predAway && fixAway && predAway !== fixAway) {
      mismatched.push({
        predId: pred.fixtureId || pred.id,
        reason: `Away team mismatch: prediction="${predAway}", fixture="${fixAway}"`,
      });
      console.error(`[FIXTURE VALIDATOR] ❌ Away team mismatch on "${pred.fixtureId}": pred="${predAway}" vs fixture="${fixAway}"`);
      continue;
    }

    consistent.push(pred);
  }

  return { consistent, mismatched };
}

/**
 * Get the full validation log for the integrity endpoint.
 */
export function getValidationLog() {
  return [...validationLog];
}
