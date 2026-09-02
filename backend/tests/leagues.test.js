import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FD_LEAGUES, APF_LEAGUES } from '../constants/leagues.js';
import { LEAGUE_CODES } from '../services/footballdata.js';

const IN_SCOPE = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC'];

test('FD_LEAGUES is exactly the nine free-tier competitions', () => {
  assert.deepEqual(Object.keys(FD_LEAGUES).sort(), [...IN_SCOPE].sort());
});

test('Europa League is absent — it is not in the free tier', () => {
  assert.equal('EL' in FD_LEAGUES, false);
  assert.equal(LEAGUE_CODES.includes('EL'), false);
});

test('API-Football leagues are removed', () => {
  assert.deepEqual(APF_LEAGUES, {});
});

test('LEAGUE_CODES matches FD_LEAGUES', () => {
  assert.deepEqual([...LEAGUE_CODES].sort(), Object.keys(FD_LEAGUES).sort());
});

test('every league has a name and country', () => {
  for (const [code, info] of Object.entries(FD_LEAGUES)) {
    assert.ok(info.name, `${code} missing name`);
    assert.ok(info.country, `${code} missing country`);
  }
});
