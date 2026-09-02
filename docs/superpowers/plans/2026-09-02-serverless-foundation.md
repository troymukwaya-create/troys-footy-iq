# Serverless Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Oddyessa API off the suspended Render instance onto Vercel serverless functions backed by Neon Postgres, so `oddyessa.com` serves live data again at $0/month.

**Architecture:** The Express app is extracted from `server.js` into a transport-agnostic `app.js`. `server.js` remains the local dev entry (HTTP + WebSocket + cron); a new `api/index.js` exports the same app as a Vercel serverless handler. Two pieces of in-process state that cannot survive serverless — the admin session store and the WebSocket `broadcast` — are replaced with a stateless signed token and a registerable sink.

**Tech Stack:** Node 24 (Vercel) / 25 (local), ESM, Express 5, `pg`, Vercel Hobby, Neon Postgres Free. Tests use Node's built-in `node:test` runner — **no new dependencies**.

**Spec:** `docs/superpowers/specs/2026-09-02-free-tier-revival-design.md`

## Global Constraints

- **Zero new runtime dependencies.** Tests use `node:test` + `node:assert/strict`, both built in.
- **ESM only.** `backend/package.json` sets `"type": "module"`; use `import`, never `require`.
- **No paid services.** Never add API-Football, The Odds API paid tiers, or Render.
- **In-scope competitions (exactly 9):** `PL`, `PD`, `BL1`, `SA`, `FL1`, `CL`, `DED`, `PPL`, `ELC`.
- **`EL` (Europa League) must not appear** — it is not in football-data.org's free tier.
- **No in-process state may gate a request.** Any module-level `Map`, counter, or connection set that a response depends on is a bug on serverless.
- **Branch from `origin/main` (`85a9c71`).** The local checkout is on `feat/fanbrain-diagnostics` (`0e73ad3`) and is a stale mirror.

---

## Task 0: Branch from origin/main

**Files:** none (git only)

**Interfaces:**
- Produces: a clean working branch `feat/serverless-foundation` off `origin/main`.

- [ ] **Step 1: Stash the stale working tree**

The checkout has uncommitted edits to social workflow files that are unrelated to this work.

```bash
cd Website
git stash push -u -m "pre-serverless-foundation stash"
```

- [ ] **Step 2: Fetch and branch**

```bash
git fetch origin
git checkout -b feat/serverless-foundation origin/main
git log --oneline -1
```

Expected: `85a9c71 fix(performance): headline overall counts locked models only`

---

## Task 1: Stateless admin auth

Replaces the in-memory session `Map` with an HMAC-signed token. This is the blocker from spec §4.5 — without it, admin login succeeds and every subsequent request 401s on serverless.

**Files:**
- Modify: `backend/services/adminAuth.js` (whole file)
- Test: `backend/tests/adminAuth.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces — unchanged public surface, so no route file changes:
  - `mintToken(): string` — format `"<expiresAtMs>.<nonceHex>.<hmacHex>"`
  - `isValidToken(token: unknown): boolean`
  - `passwordMatches(input: unknown): boolean`
  - `requireAuth(req, res, next): void`
- New env var: `ADMIN_TOKEN_SECRET` (optional; falls back to `ADMIN_PASSWORD`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/adminAuth.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test backend/tests/adminAuth.test.js
```

Expected: FAIL. `a token validates on a different instance` fails because the current `sessions` Map is per-instance. `two minted tokens differ` passes already (random bytes), and the malformed-input cases may throw rather than return `false`.

- [ ] **Step 3: Rewrite adminAuth.js**

Replace the entire contents of `backend/services/adminAuth.js`:

```js
// ─── ADMIN AUTH (shared) ────────────────────────────────────────────
// Single-CEO auth. A correct ADMIN_PASSWORD mints a STATELESS signed
// token: "<expiresAtMs>.<nonce>.<hmac>". There is no session store, so a
// token minted by one serverless instance verifies on every other one.
//
// Secret: ADMIN_TOKEN_SECRET, falling back to ADMIN_PASSWORD so the
// deployment needs no new secret to work.

import crypto from 'crypto';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days

function secret() {
  const s = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';
  if (!s) throw new Error('ADMIN_TOKEN_SECRET or ADMIN_PASSWORD must be set');
  return s;
}

function sign(expiresAt, nonce) {
  return crypto.createHmac('sha256', secret())
    .update(`${expiresAt}.${nonce}`)
    .digest('hex');
}

export function mintToken() {
  const expiresAt = Date.now() + SESSION_TTL;
  const nonce = crypto.randomBytes(16).toString('hex');
  return `${expiresAt}.${nonce}.${sign(expiresAt, nonce)}`;
}

export function isValidToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expPart, nonce, sig] = parts;
  const expiresAt = Number(expPart);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  let expected;
  try { expected = sign(expiresAt, nonce); } catch { return false; }

  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Constant-time password comparison against ADMIN_PASSWORD.
export function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Express middleware — 401s any request without a valid bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !isValidToken(token)) {
    return res.status(401).json({ error: true, message: 'Unauthorized' });
  }
  next();
}

export default { mintToken, isValidToken, passwordMatches, requireAuth };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test backend/tests/adminAuth.test.js
```

Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add backend/services/adminAuth.js backend/tests/adminAuth.test.js
git commit -m "fix(admin): stateless signed tokens so auth survives serverless"
```

---

## Task 2: Transport-agnostic broadcast sink

`jobs/scheduler.js` currently does `import { broadcast } from '../server.js'`. That drags the WebSocket server into anything importing the scheduler, and cannot work serverless. Extract it behind a registerable sink, mirroring the existing `registerClientCounter` pattern in `services/runtimeStats.js`.

**Files:**
- Create: `backend/services/broadcast.js`
- Modify: `backend/jobs/scheduler.js:4`
- Test: `backend/tests/broadcast.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `broadcast(type: string, payload: unknown): void` — no-op when no sink registered
  - `registerBroadcastSink(fn: ((type, payload) => void) | null): void`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/broadcast.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test backend/tests/broadcast.test.js
```

Expected: FAIL — `Cannot find module .../services/broadcast.js`.

- [ ] **Step 3: Create the module**

Create `backend/services/broadcast.js`:

```js
// ─── BROADCAST SINK ─────────────────────────────────────────────────
// Transport-agnostic fan-out. server.js (local dev) registers a WebSocket
// sink; serverless leaves the default no-op in place. Keeping this out of
// server.js lets jobs/ import broadcast without pulling in the ws server.

let sink = null;

export function registerBroadcastSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

export function broadcast(type, payload) {
  // Mirrors runtimeStats.getClientCount(): a misbehaving registered function
  // must never destabilise the caller. Task 3 registers a sink that does
  // JSON.stringify + ws.send, both of which can throw.
  try { if (sink) sink(type, payload); } catch { /* a bad sink must never break the caller */ }
}

export default { broadcast, registerBroadcastSink };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test backend/tests/broadcast.test.js
```

Expected: PASS, 3/3.

- [ ] **Step 5: Repoint the scheduler**

In `backend/jobs/scheduler.js`, change line 4 from:

```js
import { broadcast } from '../server.js';
```

to:

```js
import { broadcast } from '../services/broadcast.js';
```

- [ ] **Step 6: Verify no module still imports broadcast from server.js**

```bash
grep -rn "broadcast" backend --include="*.js" | grep -v node_modules | grep "server.js"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add backend/services/broadcast.js backend/tests/broadcast.test.js backend/jobs/scheduler.js
git commit -m "refactor(broadcast): decouple fan-out from the websocket server"
```

---

## Task 3: Extract the Express app from server.js

**Files:**
- Create: `backend/app.js`
- Modify: `backend/server.js` (whole file)
- Test: `backend/tests/app.test.js` (create)

**Interfaces:**
- Consumes: `registerBroadcastSink` from Task 2.
- Produces:
  - `backend/app.js` default export: the configured Express `app`, all routers mounted, **no** `listen`, **no** WebSocket, **no** cron.
  - `backend/app.js` named export `ensureReady(): Promise<void>` — lazy, memoized bootstrap.
  - `backend/server.js`: local dev entry only, with `export function broadcast` **removed**.

**Why a lazy bootstrap:** `startServer()` currently awaits `initDb()`, model
versioning, calibration init, `precomputeDemoPredictions()` and
`seedInitialData()` before listening. On serverless this would run per cold
start — and `seedInitialData()` issues roughly twelve standings API calls,
which would burn the football-data.org quota on every new instance. `app.js`
therefore memoizes only the cheap, required init and **never** seeds or
precomputes. Those stay in `server.js`, which runs once locally.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/app.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test backend/tests/app.test.js
```

Expected: FAIL — `Cannot find module .../app.js`.

- [ ] **Step 3: Create app.js by copying server.js, then deleting**

```bash
cp backend/server.js backend/app.js
```

Now edit `backend/app.js`. **Delete** each of these regions (line numbers refer to the original `server.js`):

| Lines | What | Why |
|---|---|---|
| 41–42 | `import http` and `import { WebSocketServer } from 'ws'` | no listener, no sockets |
| 50 | `import initJobs from './jobs/scheduler.js'` | cron lives in server.js |
| 79 | `import { registerClientCounter } …` | WebSocket-only |
| 84–105 | `const port`, `createServer`, `wss`, `clients`, `registerClientCounter(...)`, `wss.on('connection')`, `export function broadcast` | all in-process transport state |
| 260–314 | the `SEED INITIAL DATA` comment and `async function seedInitialData()` | makes ~12 API calls; must never run serverless |
| 316–357 | the `START SERVER` comment and `async function startServer()`, including the `keepWarm` self-ping to the Render URL | the Render host no longer exists |
| 359–362 | the `startServer().catch(...)` invocation | nothing to start |
| 364–386 | the `GRACEFUL SHUTDOWN` comment, `gracefulShutdown()`, and the `SIGTERM`/`SIGINT` handlers | no process to shut down |

All four ranges were verified against this branch with `grep -n` — `server.js` is 386 lines, `seedInitialData` closes at 314, `startServer` closes at 357, and `gracefulShutdown` opens at 364.

**Keep** everything else: the dotenv bootstrap, every router import, `const app = express()`, CORS, `express.json()`, the response-time logger, `/health`, `/api/health`, `/api/status`, the whole `safeMount` block, the `/api/debug` mount, and `/api/model/performance`.

- [ ] **Step 4: Add the lazy bootstrap and the default export**

Append to `backend/app.js`, after the last route and before nothing else:

```js
// ─── LAZY BOOTSTRAP ─────────────────────────────────────────────────
// Serverless has no startup hook, so init runs on the first request of an
// instance and is memoized for the rest of its life. Deliberately excludes
// seedInitialData() and precomputeDemoPredictions() — both are expensive and
// seeding spends football-data.org quota. Those remain in server.js.
let readyPromise = null;

async function bootstrap() {
  await initDb();
  const { getActiveVersion } = await import('./engine/modelVersioning.js');
  await getActiveVersion();
  const { initCalibration } = await import('./engine/calibrationLayer.js');
  await initCalibration();
}

export function ensureReady() {
  if (!readyPromise) {
    readyPromise = bootstrap().catch((err) => {
      console.error('[app] bootstrap failed:', err.message);
      readyPromise = null;   // let the next request retry
    });
  }
  return readyPromise;
}

export default app;
```

Then mount it as the **first** middleware — immediately after `app.use(express.json());`:

```js
app.use(async (_req, _res, next) => { await ensureReady(); next(); });
```

- [ ] **Step 5: Trim server.js to the local dev entry**

Now edit `backend/server.js`. **Delete** the regions that moved to `app.js`: the router imports (lines 55–78), `const app = express()` and the CORS/`express.json()`/response-time middleware, `/health`, `/api/health`, `/api/status`, the entire `safeMount` block, the `/api/debug` mount, and `/api/model/performance`.

**Keep**: the dotenv bootstrap, `seedInitialData()`, `startServer()`, and `gracefulShutdown()`.

Then apply these four changes:

1. Replace the deleted app construction with an import at the top:

```js
import app, { ensureReady } from './app.js';
import { registerBroadcastSink } from './services/broadcast.js';
```

2. Restore the transport block (it was deleted from `app.js`, and belongs here):

```js
const port = process.env.PORT || 3001;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

registerClientCounter(() => clients.size);

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'INIT', payload: { liveMatches: [], fixtures: [] } }));
});

registerBroadcastSink((type, payload) => {
  const message = JSON.stringify({ type, payload });
  clients.forEach((ws) => { if (ws.readyState === 1) ws.send(message); });
});
```

3. In `startServer()`, replace the `await initDb()` line and the model-versioning and calibration blocks with a single call, since `app.js` now owns that sequence:

```js
await ensureReady();
```

Leave `precomputeDemoPredictions()` and `seedInitialData()` where they are — they are correct for a long-running local process.

4. Delete the `keepWarm` self-ping block at the end of `startServer()` entirely. It pings `troys-footy-iq-api.onrender.com`, which no longer exists.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
node --test backend/tests/*.test.js
```

Expected: PASS across `adminAuth`, `broadcast` and `app` tests.

- [ ] **Step 7: Verify the dev server still boots**

```bash
cd backend && timeout 20 node server.js
```

Expected: `[server] listening on :3001` and no import errors. A DB warning is fine — Neon is not wired until Task 5.

- [ ] **Step 8: Commit**

```bash
git add backend/app.js backend/server.js backend/tests/app.test.js
git commit -m "refactor(server): split express app from the listener, ws and cron"
```

---

## Task 4: Reconfigure the league set

**Files:**
- Modify: `backend/constants/leagues.js` (whole file)
- Modify: `backend/services/footballdata.js:25` (`LEAGUE_CODES`)
- Test: `backend/tests/leagues.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `FD_LEAGUES` with exactly the 9 in-scope codes; `APF_LEAGUES` as `{}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/leagues.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test backend/tests/leagues.test.js
```

Expected: FAIL — `EL` and `BSA` present, `APF_LEAGUES` non-empty, `DED`/`PPL`/`ELC` missing.

- [ ] **Step 3: Rewrite constants/leagues.js**

```js
// In-scope competitions: domestic European leagues + the Champions League.
// Every code below is inside football-data.org's FREE tier ("free forever").
// Europa League and Conference League are deliberately absent — they require
// the paid €49/mo Standard plan. See docs/superpowers/specs/
// 2026-09-02-free-tier-revival-design.md §2.
export const FD_LEAGUES = {
  PL:  { name: 'Premier League',   country: 'England'     },
  PD:  { name: 'La Liga',          country: 'Spain'       },
  BL1: { name: 'Bundesliga',       country: 'Germany'     },
  SA:  { name: 'Serie A',          country: 'Italy'       },
  FL1: { name: 'Ligue 1',          country: 'France'      },
  CL:  { name: 'Champions League', country: 'UEFA'        },
  DED: { name: 'Eredivisie',       country: 'Netherlands' },
  PPL: { name: 'Primeira Liga',    country: 'Portugal'    },
  ELC: { name: 'Championship',     country: 'England'     },
};

// API-Football is no longer used. It existed only to gap-fill Eredivisie and
// Primeira Liga, which football-data.org's free tier now covers directly.
// Kept as an empty object so existing importers keep working.
export const APF_LEAGUES = {};
```

- [ ] **Step 4: Update LEAGUE_CODES in footballdata.js**

In `backend/services/footballdata.js`, replace line 25 — note the trailing comment, which must go too:

```js
export const LEAGUE_CODES = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'BSA', 'CL', 'EL', 'ELC']; // EL = Europa League
```

with:

```js
export const LEAGUE_CODES = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC'];
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test backend/tests/leagues.test.js
```

Expected: PASS, 5/5.

- [ ] **Step 6: Check for orphaned references**

```bash
grep -rn "APF_LEAGUES\|'EL'\|\"EL\"" backend --include="*.js" | grep -v node_modules | grep -v tests/
```

Expected: `dataRouter.js` and `server.js`/`app.js` still reference `APF_LEAGUES`. They iterate `Object.keys(APF_LEAGUES)`, which is now empty, so they degrade to no-ops safely. Leave them; Plan 2 removes the dead paths.

- [ ] **Step 7: Commit**

```bash
git add backend/constants/leagues.js backend/services/footballdata.js backend/tests/leagues.test.js
git commit -m "feat(leagues): scope to nine free-tier European competitions"
```

---

## Task 5: Provision Neon and connect

**Files:**
- Create: `backend/scripts/db-smoke.mjs`

**Interfaces:**
- Consumes: `backend/db/schema.sql` (existing).
- Produces: a reachable `DATABASE_URL` and a verified schema.

- [ ] **Step 1: Create the Neon project (manual)**

At <https://neon.com>, sign up (no credit card) and create project `oddyessa`, Postgres 17, region closest to your Vercel deployment. Copy the pooled connection string — it looks like:

```
postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Use the **pooled** (`-pooler`) host. Serverless functions open many short connections, which exhausts a direct endpoint.

- [ ] **Step 2: Apply the schema**

```bash
export DATABASE_URL='<the pooled connection string>'
psql "$DATABASE_URL" -f backend/db/schema.sql
```

Expected: `CREATE TABLE` output with no errors.

- [ ] **Step 3: Restore the ledger if the dump exists**

Only if Phase 0 produced a dump:

```bash
pg_restore --no-owner --no-privileges --data-only \
  -d "$DATABASE_URL" ~/Desktop/oddyessa-ledger-2026-09-02.dump
```

If the dump does not exist, continue — the schema is enough to bring the API up, and the ledger is repopulated in Plan 2.

- [ ] **Step 4: Write the smoke-test script**

Create `backend/scripts/db-smoke.mjs`:

```js
// Verifies DATABASE_URL is reachable and the schema applied.
// Usage: DATABASE_URL='...' node backend/scripts/db-smoke.mjs
import pg from 'pg';

const REQUIRED = ['fixtures', 'predictions', 'model_performance', 'team_season_stats'];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
);
const present = new Set(rows.map((r) => r.table_name));
const missing = REQUIRED.filter((t) => !present.has(t));

console.log(`tables found: ${present.size}`);
for (const t of REQUIRED) {
  const { rows: c } = present.has(t)
    ? await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)
    : { rows: [{ n: 0 }] };
  console.log(`  ${present.has(t) ? 'ok  ' : 'MISS'} ${t.padEnd(20)} rows=${c[0].n}`);
}

await client.end();

if (missing.length) {
  console.error(`MISSING TABLES: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('schema OK');
```

- [ ] **Step 5: Run the smoke test**

```bash
DATABASE_URL="$DATABASE_URL" node backend/scripts/db-smoke.mjs
```

Expected: `schema OK` and a table count of roughly 35.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/db-smoke.mjs
git commit -m "chore(db): add Neon connectivity smoke test"
```

Do **not** commit the connection string.

---

## Task 6: Vercel serverless entry

**Files:**
- Create: `api/index.js` (repository root)
- Create: `vercel.json` (repository root)
- Delete: `frontend/vercel.json`

**Interfaces:**
- Consumes: `backend/app.js` default export from Task 3.
- Produces: `/api/*` served by the Express app; all other paths served by the SPA.

- [ ] **Step 1: Create the function entry**

Create `api/index.js`:

```js
// Vercel serverless entry. An Express app is already a (req, res) handler,
// so exporting it directly is all Vercel's Node runtime needs.
import app from '../backend/app.js';

export default app;
```

- [ ] **Step 2: Create the root vercel.json**

Create `vercel.json` at the repository root:

```json
{
  "installCommand": "npm --prefix backend install && npm --prefix frontend install",
  "buildCommand": "npm --prefix frontend run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

The rewrite's negative lookahead is load-bearing: a plain `/(.*)` catch-all would swallow `/api/*` and return `index.html` for every API call.

- [ ] **Step 3: Remove the old frontend config**

```bash
git rm frontend/vercel.json
```

- [ ] **Step 4: Change the Vercel Root Directory (manual)**

In the Vercel dashboard → project `frontend` → Settings → Build & Deployment → **Root Directory**: change from `frontend` to empty (repository root), then save.

This is required. With the root set to `frontend/`, `api/index.js` cannot import `../backend/app.js` because files outside the root are not uploaded.

- [ ] **Step 5: Set environment variables (manual)**

In Vercel → Settings → Environment Variables, for **Production**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** connection string |
| `ADMIN_PASSWORD` | your admin password |
| `ADMIN_TOKEN_SECRET` | `openssl rand -hex 32` output |
| `FOOTBALLDATA_TOKEN` | your football-data.org free token |
| `NARRATIVE_POLISH` | `off` |

**Delete** `VITE_API_URL` if present — Task 7 depends on it being unset so the frontend falls back to same-origin `/api`. Do not set `APISPORTS_KEY`, `THE_ODDS_API_KEY` or `ANTHROPIC_API_KEY`.

- [ ] **Step 6: Deploy and verify the API responds**

```bash
git add api/index.js vercel.json
git commit -m "feat(vercel): serve the express app as a serverless function"
git push -u origin feat/serverless-foundation
```

Deploy this branch as a preview from the Vercel dashboard, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<preview-url>/api/health"
```

Expected: `200`. If `404`, the Root Directory change in Step 4 did not save.

- [ ] **Step 7: Verify admin auth works across invocations**

```bash
TOKEN=$(curl -s -X POST "https://<preview-url>/api/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"password":"<your admin password>"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" \
    "https://<preview-url>/api/admin/system" -H "Authorization: Bearer $TOKEN"
done
```

Expected: `200` five times. This is the direct regression test for the Task 1 blocker — with the old in-memory store, some attempts would return `401`.

---

## Task 7: Frontend same-origin API and polling

**Files:**
- Modify: `frontend/src/hooks/useRealTime.js` (whole file)
- Test: manual verification in the browser

**Interfaces:**
- Consumes: `/api/fixtures/live` served from Task 6.
- Produces: `useRealTime()` with the same call signature, backed by polling instead of WebSocket.

- [ ] **Step 1: Confirm the live-fixtures response shape**

```bash
curl -s "https://<preview-url>/api/fixtures/live" | head -c 400
```

Note whether the array is at the top level or under `.data`. The implementation below handles both.

- [ ] **Step 2: Replace useRealTime.js**

```js
import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import api from '../api/client';

// WebSockets cannot be held open by serverless functions, so live state is
// polled. football-data.org's free tier serves delayed scores anyway, so a
// 60s poll loses nothing a socket would have delivered.
const POLL_MS = 60_000;

export function useRealTime() {
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const { setLiveMatches, updateFixtureScore, setConnectionStatus } =
        useStore.getState();
      try {
        const res = await api.get('/fixtures/live');
        if (cancelled) return;
        const body = res?.data;
        const live = Array.isArray(body) ? body
          : Array.isArray(body?.data) ? body.data
          : [];
        setLiveMatches(live);
        live.forEach((m) =>
          updateFixtureScore(m.id, m.score, m.minute, m.status, m.probability)
        );
        setConnectionStatus('connected');
      } catch {
        if (!cancelled) setConnectionStatus('disconnected');
      }
    }

    poll();
    timer.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
}
```

- [ ] **Step 3: Confirm no WebSocket references remain**

```bash
grep -rn "WebSocket\|VITE_WS_URL\|wss://" frontend/src | grep -v node_modules
```

Expected: no output.

- [ ] **Step 4: Build the frontend**

```bash
npm --prefix frontend run build
```

Expected: build succeeds with no unresolved imports.

- [ ] **Step 5: Verify in the browser**

Open the preview URL. In DevTools:
- Console shows **no** CORS errors and **no** `wss://` failures.
- Network shows `/api/fixtures/live` returning 200 from the same origin, repeating about once a minute.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useRealTime.js
git commit -m "feat(frontend): poll live fixtures same-origin, drop websockets"
```

---

## Task 8: Fail closed when no AI key is configured

`services/ai.js:47` sends `x-api-key: process.env.ANTHROPIC_API_KEY` with no
guard. With the key deliberately unset (spec §4.3), every match-page request
would send `undefined` and 401-loop against Anthropic — logging failures via
`recordApiCall` and polluting the admin health panel.

**Files:**
- Modify: `backend/services/ai.js` (top of `analyzeFixture`, line 8)
- Test: `backend/tests/aiGuard.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `analyzeFixture(fixture)` resolves to `null` when AI is disabled,
  instead of issuing an unauthenticated HTTP request.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/aiGuard.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test backend/tests/aiGuard.test.js
```

Expected: FAIL — the function attempts a network call and rejects or times out
rather than returning `null`.

- [ ] **Step 3: Add the guard**

In `backend/services/ai.js`, insert as the first statement inside
`analyzeFixture` (line 8):

```js
export async function analyzeFixture(fixture) {
  // AI is off by default on the free stack (spec §4.3). Fail closed rather
  // than firing an unauthenticated request at Anthropic on every match view.
  if (!process.env.ANTHROPIC_API_KEY || process.env.NARRATIVE_POLISH === 'off') {
    return null;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test backend/tests/aiGuard.test.js
```

Expected: PASS, 2/2.

- [ ] **Step 5: Confirm callers tolerate null**

```bash
grep -rn "analyzeFixture" backend --include="*.js" | grep -v node_modules | grep -v tests/
```

Check each call site handles a `null` return. Any that dereferences the result
directly needs an `if (!analysis) return ...` branch before it.

- [ ] **Step 6: Commit**

```bash
git add backend/services/ai.js backend/tests/aiGuard.test.js
git commit -m "fix(ai): return null when no key is configured instead of 401-looping"
```

---

## Task 9: Promote to production

- [ ] **Step 1: Run the full test suite**

```bash
node --test backend/tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Merge to main**

```bash
git checkout main && git pull origin main
git merge --no-ff feat/serverless-foundation \
  -m "feat: serverless foundation on Vercel + Neon"
git push origin main
```

- [ ] **Step 3: Verify production**

```bash
curl -s -o /dev/null -w "site  %{http_code}\n" https://oddyessa.com/
curl -s -o /dev/null -w "api   %{http_code}\n" https://oddyessa.com/api/health
```

Expected: `200` for both. Compare with the pre-work baseline, where the API returned `503 Service Suspended`.

- [ ] **Step 4: Decommission Render**

Only after production is verified green: delete the `troys-footy-iq-api` service in the Render dashboard. **Do not delete the database** until the dump is confirmed restored into Neon.

- [ ] **Step 5: Disable the obsolete keepalive workflow**

```bash
gh workflow disable keepalive.yml
```

It pings a host that no longer exists.

---

## What this plan does NOT cover

Deferred to the follow-on plans, by design:

- **Plan 2 — Scheduled engine:** GitHub Actions workflows for ingest, prediction, grading and the daily email; the `ledger.json` snapshot commit; the static ledger fallback; removal of the now-dead `APF_LEAGUES` code paths. Spec phases 3–4.
- **Plan 3 — Admin dashboard metrics:** replacing `liveHealth`/`uptimeSeconds` with DB-derived values, removing `wsClients`/`memory`, and rewriting the connections panel. Spec §4.5 minus the auth fix, which lands here in Task 1 because it blocks serverless entirely.
