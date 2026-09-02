# Task 6 Report: Vercel Serverless Entry

**Status:** DONE (Fix round 1)

**Commit SHA:** `90ba4278ec977df3b18d375876fbcef6fa2bb52b` (after fix round 1)

**Commit Message:** `feat(vercel): serve the express app as a serverless function`

## Summary

Implemented Steps 1, 2, and 3 of the serverless-foundation task:
- Created `api/index.js` at repository root, importing and exporting the Express app from `backend/app.js`
- Created `vercel.json` at repository root with correct configuration for Vercel deployment
- Removed `frontend/vercel.json` via `git rm`

All three changes committed together.

## Files Changed

| Action | Path | Notes |
|--------|------|-------|
| Created | `api/index.mjs` | Vercel serverless entry point (`.mjs` for ESM unambiguity) |
| Created | `vercel.json` | Root-level Vercel configuration |
| Reverted | `package.json` | Restored `"type": "commonjs"` (no shared config change) |
| Deleted | `frontend/vercel.json` | Removed old frontend-only Vercel config |

## Verification Results (After Fix Round 1)

### 1. Syntax Check: `node --check api/index.mjs`
```
✓ PASSED
```

### 2. File Status: `git ls-files | grep -E "package.json|api/"`
```
api/index.mjs
backend/package.json
frontend/package.json
frontend/src/api/adminClient.js
frontend/src/api/client.js
package.json
✓ PASSED (api/index.mjs present, no api/index.js, no api/package.json)
```

### 3. Package.json Type: `cat package.json | grep '"type"'`
```
  "type": "commonjs",
✓ PASSED
```

### 4. Import Resolution: `node -e "import('./api/index.mjs').then(...).catch(...)"`
```
==========================================
  Oddyessa — Backend Startup
==========================================
  ENV loaded from: /Users/troykayanja/Desktop/Oddyessa/Website/backend/.env
  APISPORTS_KEY:     YES (c45b****)
  FOOTBALLDATA_TOKEN: YES (606f****)
  ANTHROPIC_API_KEY: YES
  THE_ODDS_API_KEY:  NO — market blend DISABLED, predictions run Elo-only
  DATABASE_URL:      YES
==========================================
resolved
✓ PASSED (module resolves, startup banner confirms import works)
```

## Steps Skipped (As Per Scope)

- **Step 4:** Change Vercel Root Directory in dashboard (requires browser/login)
- **Step 5:** Set environment variables in Vercel dashboard (requires browser/login)
- **Step 6:** Deploy and verify API via curl (requires preview deployment)
- **Step 7:** Verify admin auth across invocations (requires preview deployment)

These steps were explicitly excluded from the scope as they require a live Vercel deployment, which this task does not provide.

## Deviations (Initial Round)

**Initial approach (reverted):** Updated root `package.json` type. This was problematic because:
- Affected other files in `scratch/` (verify_ai.js, get_match_ids.js) 
- Changed shared root config unilaterally
- Wider blast radius than needed

**Fix applied:** Use `.mjs` file extension instead. `.mjs` makes the file unambiguously ESM regardless of `package.json`, and Vercel's Node runtime supports it in `api/` with same `/api` routing.

## Self-Review (After Fix Round 1)

- ✓ All three source changes (Steps 1–3) implemented per brief specification
- ✓ File paths correct: repository root for `api/index.mjs`, `vercel.json`; old config removed
- ✓ Content matches brief exactly (including load-bearing negative lookahead in rewrite rule)
- ✓ All four verification checks pass
- ✓ Commit includes all three changes with correct message
- ✓ No environment variables set; no secrets exposed; no Vercel dashboard changes attempted
- ✓ No new npm packages added; root `package.json` reverted to original state
- ✓ No new `api/package.json` created (avoids Vercel workspace issues)
- ✓ `.mjs` extension ensures ESM resolution independent of shared config

**Ready for Steps 4–7 (manual Vercel dashboard steps in separate task).**

---

## Fix Round 1: Initial Finding & Correction

**Issue Found:** The initial solution modified the root `package.json` to `"type": "module"`. This had a wider blast radius than needed:
- `scratch/verify_ai.js` and `scratch/get_match_ids.js` are governed by that same setting
- Changing shared root config affects multiple unrelated files

**Correction Applied:**
1. Reverted `package.json` back to `"type": "commonjs"`
2. Renamed `api/index.js` → `api/index.mjs` (`.mjs` extension makes file unambiguously ESM)
3. Vercel's Node runtime supports `.mjs` in `api/` directory with same `/api` routing
4. Verified all four checks still pass with `.mjs` extension

**Rationale:** File-extension-based ESM declaration is more targeted and doesn't affect unrelated code in the project. The `.mjs` standard is widely supported and explicitly signals ESM intent.
