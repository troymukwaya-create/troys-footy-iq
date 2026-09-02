import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'test-password';
process.env.ADMIN_TOKEN_SECRET = 'test-secret-value';

const { mintToken, isValidToken, passwordMatches } =
  await import('../services/adminAuth.js');

test('a freshly minted token validates', () => {
  assert.equal(isValidToken(mintToken()), true);
});

test('a token validates on a different instance', async () => {
  const token = mintToken();
  // A query string forces a fresh module registry entry, which simulates a
  // second serverless instance with no shared memory. This is the exact case
  // the old in-memory Map failed.
  const fresh = await import('../services/adminAuth.js?instance=2');
  assert.equal(fresh.isValidToken(token), true);
});

test('two minted tokens differ', () => {
  assert.notEqual(mintToken(), mintToken());
});

test('a tampered signature is rejected', () => {
  const [exp, nonce, sig] = mintToken().split('.');
  assert.equal(isValidToken(`${exp}.${nonce}.${'0'.repeat(sig.length)}`), false);
});

test('an expired token is rejected', () => {
  assert.equal(isValidToken(`${Date.now() - 1000}.abcd.deadbeef`), false);
});

test('malformed input is rejected', () => {
  for (const bad of ['nonsense', '', null, undefined, 42, 'a.b', 'a.b.c.d']) {
    assert.equal(isValidToken(bad), false, `expected reject: ${String(bad)}`);
  }
});

test('password comparison still works', () => {
  assert.equal(passwordMatches('test-password'), true);
  assert.equal(passwordMatches('wrong'), false);
  assert.equal(passwordMatches(''), false);
});
