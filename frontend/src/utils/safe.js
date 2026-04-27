/**
 * Global safe helper for risk-free data access in React components.
 * Prevents "Cannot read properties of undefined" crashes.
 */
export function safe(fn, fallback = null) {
  try {
    const result = fn();
    return result !== undefined && result !== null ? result : fallback;
  } catch (e) {
    // console.warn('Safe access failed:', e.message);
    return fallback;
  }
}

/**
 * Ensures a value is a valid number, or returns a fallback.
 */
export function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}
