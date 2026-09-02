import { test } from 'node:test';
import assert from 'node:assert/strict';
import { broadcast, registerBroadcastSink } from '../services/broadcast.js';

test('broadcast is a no-op with no sink registered', () => {
  registerBroadcastSink(null);
  assert.doesNotThrow(() => broadcast('GOAL_SCORED', { id: 1 }));
});

test('a registered sink receives type and payload', () => {
  const seen = [];
  registerBroadcastSink((type, payload) => seen.push([type, payload]));
  broadcast('LIVE_SCORES_UPDATE', [{ id: 'fd_1' }]);
  assert.deepEqual(seen, [['LIVE_SCORES_UPDATE', [{ id: 'fd_1' }]]]);
  registerBroadcastSink(null);
});

test('a sink can be unregistered', () => {
  let calls = 0;
  registerBroadcastSink(() => { calls += 1; });
  broadcast('A', 1);
  registerBroadcastSink(null);
  broadcast('B', 2);
  assert.equal(calls, 1);
});
