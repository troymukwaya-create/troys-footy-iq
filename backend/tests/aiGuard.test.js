import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.ANTHROPIC_API_KEY;

const { analyzeFixture } = await import('../services/ai.js');

test('returns null instead of calling Anthropic with no key', async () => {
  const result = await analyzeFixture({
    id: 'fd_1', homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
  });
  assert.equal(result, null);
});

test('returns null when NARRATIVE_POLISH is off', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  process.env.NARRATIVE_POLISH = 'off';
  const fresh = await import('../services/ai.js?guard=2');
  const result = await fresh.analyzeFixture({
    id: 'fd_2', homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
  });
  assert.equal(result, null);
  delete process.env.ANTHROPIC_API_KEY;
});
