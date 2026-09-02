import { test } from 'node:test';
import assert from 'node:assert/strict';

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
