import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';

test('app.js exports a callable express handler', async () => {
  const mod = await import('../app.js');
  const app = mod.default;
  assert.equal(typeof app, 'function', 'default export must be the express app');
  assert.equal(typeof app.use, 'function', 'must look like an express app');
});

test('app.js exposes no websocket broadcast', async () => {
  const mod = await import('../app.js');
  assert.equal(mod.broadcast, undefined,
    'broadcast belongs in services/broadcast.js, not the app');
});

test('app.js exports a memoized ensureReady', async () => {
  const { ensureReady } = await import('../app.js');
  assert.equal(typeof ensureReady, 'function');
  // Two calls must return the same promise — bootstrap runs once per instance,
  // not once per request. With no DATABASE_URL, bootstrap rejects internally
  // and is caught, so this resolves either way.
  const a = ensureReady();
  const b = ensureReady();
  assert.equal(a, b, 'ensureReady must memoize');
  await a;
});

// ─── HTTP ROUND-TRIP TESTS ──────────────────────────────────────────
// The tests above only import the module and inspect its exports — they
// never prove the ready-gate is actually mounted early enough to gate real
// routes, that the health-check exemption works, or that a mounted route is
// reachable end to end. These spin up a real listener on an ephemeral port
// and make real HTTP requests through it.
async function withServer(fn) {
  const app = (await import('../app.js')).default;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try { return await fn(server.address().port); }
  finally { await new Promise((r) => server.close(r)); }
}

test('the exempt liveness probe responds', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });
});

test('a mounted route is reachable through the ready gate', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(res.status, 200);
  });
});
