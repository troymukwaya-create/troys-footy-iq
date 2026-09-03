// ─── BROADCAST SINK ─────────────────────────────────────────────────
// Transport-agnostic fan-out. server.js (local dev) registers a WebSocket
// sink; serverless leaves the default no-op in place. Keeping this out of
// server.js lets jobs/ import broadcast without pulling in the ws server.

let sink = null;

export function registerBroadcastSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

export function broadcast(type, payload) {
  try { if (sink) sink(type, payload); } catch { /* a bad sink must never break the caller */ }
}

export default { broadcast, registerBroadcastSink };
