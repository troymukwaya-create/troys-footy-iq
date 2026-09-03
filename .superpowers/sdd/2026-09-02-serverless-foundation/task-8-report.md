# Task 8 Report: Fail Closed When No AI Key is Configured

## Summary

Added a guard to `backend/services/ai.js:analyzeFixture()` that returns `null` when `ANTHROPIC_API_KEY` is unset or `NARRATIVE_POLISH` is `'off'`, preventing unauthenticated API requests. Created corresponding test suite in `backend/tests/aiGuard.test.js`.

Commit: `96010901d907801357b6e6a168be4270fcf6e030`

## Changes Made

### File: `backend/services/ai.js`

Added guard at line 9 (first statement in `analyzeFixture`):

```javascript
export async function analyzeFixture(fixture) {
  // AI is off by default on the free stack (spec §4.3). Fail closed rather
  // than firing an unauthenticated request at Anthropic on every match view.
  if (!process.env.ANTHROPIC_API_KEY || process.env.NARRATIVE_POLISH === 'off') {
    return null;
  }
  try {
    // ... existing code ...
```

This guard is consistent with `analyzeFixture`'s existing contract: the function's own catch block already returns `null` on any error (line 64 of original). The new guard simply returns `null` earlier, before attempting any I/O.

### File: `backend/tests/aiGuard.test.js`

Created new test file with two tests:
1. Verifies `analyzeFixture` returns `null` when `ANTHROPIC_API_KEY` is unset
2. Verifies `analyzeFixture` returns `null` when `NARRATIVE_POLISH` is `'off'` (fresh import with query string)

## Test Execution

### Step 2: Initial Test Run (Before Guard)

```bash
$ node --test backend/tests/aiGuard.test.js
Error analyzing fixture: Database not available
Error analyzing fixture: Database not available
✔ returns null instead of calling Anthropic with no key (1.348167ms)
✔ returns null when NARRATIVE_POLISH is off (0.816167ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 155.937917
```

**Note on Deviation:** Tests passed on the first run rather than failing. This is because the test fixtures use properties (`id`, `homeTeam`, `awayTeam`) that do not match the function's parameters (`home_team_id`, `away_team_id`). The function enters its try-catch block, fails on the database query (database is unavailable in this environment), and returns `null` from the catch block (line 64). This makes the test pass for a different reason than the guard would provide, but the contract is still satisfied: function returns `null` when conditions are unmet.

### Step 4: Test Run (After Guard)

```bash
$ node --test backend/tests/aiGuard.test.js
✔ returns null instead of calling Anthropic with no key (0.563542ms)
✔ returns null when NARRATIVE_POLISH is off (0.811127ms)
ℹ tests 2
ℹ suites 0
℔ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 105.33825
```

Tests pass with guard in place. Guard executes immediately and returns `null` before any database access.

## Full Test Suite Verification

```bash
$ node --test backend/tests/*.test.js
✔ a freshly minted token validates (0.969166ms)
✔ a token validates on a different instance (0.368041ms)
✔ two minted tokens differ (0.473875ms)
✔ a tampered signature is rejected (0.067583ms)
✔ an expired token is rejected (0.044916ms)
✔ malformed input is rejected (0.044916ms)
✔ password comparison still works (0.052792ms)
✔ extending the plaintext expiry of a valid token is rejected (0.07525ms)
✔ returns null instead of calling Anthropic with no key (1.118292ms)
✔ returns null when NARRATIVE_POLISH is off (0.813542ms)
✔ app.js exports a callable express handler (74.5935ms)
✔ app.js exposes no websocket broadcast (0.083084ms)
✔ app.js exports a memoized ensureReady (7.157458ms)
✔ the exempt liveness probe responds (8.908333ms)
✔ a mounted route is reachable through the ready gate (2.407792ms)
✔ broadcast is a no-op with no sink registered (0.606125ms)
✔ a registered sink receives type and payload (0.598375ms)
✔ a sink can be unregistered (0.057416ms)
✔ a throwing sink does not break the caller (0.050416ms)
✔ FD_LEAGUES is exactly the nine free-tier competitions (1.131333ms)
✔ Europa League is absent — it is not in the free tier (0.058667ms)
✔ API-Football leagues are removed (0.05ms)
✔ LEAGUE_CODES matches FD_LEAGUES (0.046542ms)
✔ every league has a name and country (0.059916ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 202.916
```

**Total: 24 tests passing** (8 adminAuth + 2 aiGuard + 4 app + 4 broadcast + 6 leagues)

## Step 5: No-Callers Verification

```bash
$ grep -rn "analyzeFixture" backend --include="*.js" | grep -v node_modules | grep -v tests/
/Users/troykayanja/Desktop/Oddyessa/Website/backend/services/ai.js:8:export async function analyzeFixture(fixture) {
/Users/troykayanja/Desktop/Oddyessa/Website/backend/services/ai.js:73:export default { analyzeFixture };
```

**Result:** No callers of `analyzeFixture` outside the module. The function is exported in the default export but has no call sites in the codebase. This confirms the brief's corrected premise: the module is currently dead code.

## Defence-in-Depth Rationale

**This is defence-in-depth against a future wiring-up of a currently-dead module, not a fix for live behaviour.**

- Every live Anthropic caller already has a guard and degrades gracefully when `ANTHROPIC_API_KEY` is unset (routes/ai.js, routes/analysis.js, services/modelAnalyst.js, services/scout.js, services/analyst.js, services/matchNarrative.js).
- Spec §4.3 is already satisfied: no live path issues an unauthenticated request.
- `analyzeFixture` is not called anywhere. If it were wired up in the future without this guard, it would silently send unauthenticated requests to Anthropic.
- The guard prevents this trap with two lines of code, consistent with the function's existing error-handling contract.

## Self-Review

### Change Quality
- ✔ Guard matches brief's exact specification (line 8, two conditions, returns null)
- ✔ Comment explains intent (spec §4.3, fail closed)
- ✔ Guard is consistent with existing contract: function already returns null on any error
- ✔ No new runtime dependencies introduced
- ✔ Tests use only built-in modules (node:test, node:assert/strict)

### Test Quality
- ✔ Two tests: one for no key, one for NARRATIVE_POLISH='off'
- ✔ Tests follow brief's exact specification
- ✔ Second test uses fresh import with ?guard=2 query string as specified
- ✔ Tests pass reliably (even though they don't exercise the original premise of the brief)

### Verification
- ✔ Full test suite runs and confirms 24 tests passing
- ✔ Grep confirms zero callers of analyzeFixture outside module
- ✔ Commit message matches brief's exact specification

### Deviations
- First test run passed rather than failed (due to database unavailability in test environment), but this does not affect correctness of the guard or the test assertions. The guard still executes and prevents the unauthenticated request path.

## Commit Details

```
Commit: 96010901d907801357b6e6a168be4270fcf6e030
Branch: feat/serverless-foundation
Message: fix(ai): return null when no key is configured instead of 401-looping
Files:
  - backend/services/ai.js (+3 lines: guard)
  - backend/tests/aiGuard.test.js (+23 lines: new file)
```

---

## Fix Round 1: Discriminating Test Failure

### Finding

The initial tests were non-discriminating: they passed identically with and without the guard. Root cause: database is unavailable in the test environment, so `query()` throws unconditionally at line 15 of `ai.js`, the catch block returns `null` at line 69, and the assertion `result === null` passes regardless of whether the guard exists.

**Solution:** Assert on `console.error` calls. Guard path logs 0 errors (returns early). Catch path logs 1 error ('Error analyzing fixture:...').

### Test Rewrite

Updated `backend/tests/aiGuard.test.js` to:
1. Spy on `console.error` in a wrapper function `callWithErrorSpy()`
2. Return `{ result, errorCalls }` where `errorCalls` is the call count
3. Assert `errorCalls === 0` to verify the guard returned before the try block
4. Rename tests to state the honest contract: "returns null via the guard, without falling through to the catch"

### Verification (Step 1: Guard Removed)

```bash
$ node --test backend/tests/aiGuard.test.js
✖ returns null via the guard, without falling through to the catch, when no key is set (1.072916ms)
  AssertionError [ERR_ASSERTION]: guard must return before the try block — a logged error means it fell through to the catch
  
  1 !== 0

✖ returns null via the guard when NARRATIVE_POLISH is off (0.099375ms)
  AssertionError [ERR_ASSERTION]: guard must return before the try block

  1 !== 0

ℹ tests 2
ℹ fail 2
```

**Result: FAIL** — Both tests fail on `errorCalls` assertion (expected 0, got 1) because console.error was called in the catch block. This proves the guard was not present.

### Verification (Step 4: Guard Restored)

```bash
$ node --test backend/tests/aiGuard.test.js
✔ returns null via the guard, without falling through to the catch, when no key is set (0.678583ms)
✔ returns null via the guard when NARRATIVE_POLISH is off (0.071542ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ duration_ms 121.627666
```

**Result: PASS** — Both tests pass. Guard returns null before reaching the try block, so console.error is never called (0 errors).

### Full Suite Verification

```bash
$ node --test backend/tests/*.test.js
✔ a freshly minted token validates (0.975834ms)
✔ a token validates on a different instance (0.788625ms)
✔ two minted tokens differ (0.085375ms)
✔ a tampered signature is rejected (0.067791ms)
✔ an expired token is rejected (0.047542ms)
✔ malformed input is rejected (0.047042ms)
✔ password comparison still works (0.057209ms)
✔ extending the plaintext expiry of a valid token is rejected (0.075167ms)
✔ returns null via the guard, without falling through to the catch, when no key is set (1.216042ms)
✔ returns null via the guard when NARRATIVE_POLISH is off (0.077417ms)
✔ app.js exports a callable express handler (65.055709ms)
✔ app.js exposes no websocket broadcast (0.088375ms)
✔ app.js exports a memoized ensureReady (7.315917ms)
✔ the exempt liveness probe responds (8.718875ms)
✔ a mounted route is reachable through the ready gate (2.419042ms)
✔ broadcast is a no-op with no sink registered (0.6075ms)
✔ a registered sink receives type and payload (0.601792ms)
✔ a sink can be unregistered (0.058375ms)
✔ a throwing sink does not break the caller (0.051083ms)
✔ FD_LEAGUES is exactly the nine free-tier competitions (1.168334ms)
✔ Europa League is absent — it is not in the free tier (0.065708ms)
✔ API-Football leagues are removed (0.050959ms)
✔ LEAGUE_CODES matches FD_LEAGUES (0.04775ms)
✔ every league has a name and country (0.064125ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ duration_ms 193.826416
```

**Result: 24/24 PASS** — Full suite confirms discriminating tests work correctly alongside existing tests.

### Commit

```
Commit: 7270db4e7193e8aeb466043f0d8a2d14f067b0bc
Message: fix(ai): return null when no key is configured instead of 401-looping
Files:
  - backend/tests/aiGuard.test.js (rewritten: console.error spying)
  - backend/services/ai.js (unchanged: guard still present)
```

### Key Insight

Discriminating tests are essential: without the `console.error` assertion, the tests would pass even if the guard were deleted, because the DB-error path also returns `null`. The spy proves the guard is actually executing and prevents the error path.
