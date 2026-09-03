import { test } from 'node:test';
import assert from 'node:assert/strict';

// These tests pin two things: that analyzeFixture resolves to null when AI is
// disabled, AND that it returns via the guard rather than by failing through
// to the catch block. The second part is what makes them meaningful — without
// the console.error assertion they would pass even with the guard deleted,
// because the DB is unavailable in tests and the catch also returns null.

delete process.env.ANTHROPIC_API_KEY;
const { analyzeFixture } = await import('../services/ai.js');

async function callWithErrorSpy(fixture) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => { calls.push(args); };
  try {
    const result = await analyzeFixture(fixture);
    return { result, errorCalls: calls.length };
  } finally {
    console.error = original;
  }
}

test('returns null via the guard, without falling through to the catch, when no key is set', async () => {
  const { result, errorCalls } = await callWithErrorSpy({
    id: 'fd_1', home_team_id: 1, away_team_id: 2,
  });
  assert.equal(result, null);
  assert.equal(errorCalls, 0,
    'guard must return before the try block — a logged error means it fell through to the catch');
});

test('returns null via the guard when NARRATIVE_POLISH is off', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake-key-for-testing-only';
  process.env.NARRATIVE_POLISH = 'off';
  try {
    const { result, errorCalls } = await callWithErrorSpy({
      id: 'fd_2', home_team_id: 1, away_team_id: 2,
    });
    assert.equal(result, null);
    assert.equal(errorCalls, 0, 'guard must return before the try block');
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NARRATIVE_POLISH;
  }
});
