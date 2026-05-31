// ─── RUNTIME STATS ──────────────────────────────────────────────────
// Tiny dependency-free module that exposes live process/runtime facts to
// the admin dashboard WITHOUT creating a circular import with server.js.
//
// server.js registers a WebSocket-client counter here at boot; the admin
// route reads it. Keeping this module import-free guarantees no cycles.

const SERVER_START = Date.now();

let _clientCounter = () => 0;

/** Called once from server.js after the WebSocketServer is created. */
export function registerClientCounter(fn) {
  if (typeof fn === 'function') _clientCounter = fn;
}

/** Current number of connected WebSocket clients. */
export function getClientCount() {
  try { return _clientCounter() || 0; } catch { return 0; }
}

/** Seconds the process has been running. */
export function getUptimeSeconds() {
  return Math.floor((Date.now() - SERVER_START) / 1000);
}

/** Node process memory snapshot in MB. */
export function getMemoryMB() {
  const m = process.memoryUsage();
  return {
    heapUsedMB: +(m.heapUsed / 1048576).toFixed(1),
    heapTotalMB: +(m.heapTotal / 1048576).toFixed(1),
    rssMB: +(m.rss / 1048576).toFixed(1),
  };
}

export default { registerClientCounter, getClientCount, getUptimeSeconds, getMemoryMB };
