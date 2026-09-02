# Free-Tier Revival — Design

**Date:** 2026-09-02
**Status:** Approved architecture, pending spec review
**Author:** Troy + Claude

---

## 1. Context

`oddyessa.com` serves a working frontend from Vercel (HTTP 200), but every API
call fails. The Render backend returns:

```
HTTP 503 — "This service has been suspended."
```

Browser console confirms the blast radius: `/api/fixtures/all`,
`/api/fixtures/live`, `/api/performance` and `/api/track` all fail CORS/network.
The site is not down — it is hollow. Visitors see a landing page promising
"104 matches · 104 receipts · misses printed too" with nothing behind it.

`keepalive.yml` documents the root cause in its own comment: *"Pings the Render
backend so the free instance doesn't sleep."* The web service ran on Render's
**Free** compute plan, pinged awake every 10 minutes. That consumes ~730 of the
750 monthly free instance hours while continuously reaching an external
database and external APIs — the exact profile Render's docs say it suspends:

> Render may suspend a Free web service that initiates an uncommonly high
> volume of traffic over the public internet. Examples: accessing an external
> database, invoking external APIs.

Free instance hours reset on the 1st of each month. The service was still
suspended on 2026-09-02, so this is not a monthly cap that can be waited out.

**Render free is a dead end for this workload. It has already been tried.**

### Goal

Run the entire product on free tiers, permanently, with the public track record
resilient to any single service failing. Budget is the binding constraint.

---

## 2. Scope decision — leagues

The World Cup ended 2026-07-20. Scope moves to **domestic European leagues plus
the Champions League**.

This aligns almost exactly with football-data.org's free tier, which states:
*"Access to data of these leagues & cups is free. Forever."*

**In scope (all free):**

| Code | Competition | Country |
|---|---|---|
| `PL`  | Premier League  | England |
| `PD`  | La Liga         | Spain |
| `BL1` | Bundesliga      | Germany |
| `SA`  | Serie A         | Italy |
| `FL1` | Ligue 1         | France |
| `CL`  | Champions League | UEFA |
| `DED` | Eredivisie      | Netherlands |
| `PPL` | Primeira Liga   | Portugal |
| `ELC` | Championship    | England |

**Removed:**

- `EL` (Europa League) — **not in the free tier**, requires the €49/mo Standard
  plan. Currently present in `FD_LEAGUES` and must be deleted.
- Conference League (API-Football id `848`) — not free.
- `BSA` (Brasileirão) — free, but out of the European scope. Code path retained
  at zero cost; not featured.
- All World Cup paths (`WORLD_CUP_MODE`, `wcPredictionLock`, `wcForm`,
  WC market-weight) — become dormant, not deleted.

**Consequence: API-Football is dropped entirely.** `APF_LEAGUES` existed only to
gap-fill Eredivisie and Primeira Liga, both of which the free tier now covers
directly. The Championship is gained for free.

This was verified against the engine, not assumed. `pipeline/ingest.js` — which
computes rolling team stats with anti-leakage and populates
`team_season_stats`, the table the Dixon-Coles engine reads — sources entirely
from `https://api.football-data.org/v4`. It has never depended on API-Football.
`dataIngestionService.js` names football-data.org as "Source 1 — primary".

---

## 3. Target architecture

```
                       ┌──────────────────────────────┐
   Browser ───────────▶│  Vercel (Hobby, free)        │
                       │  • static frontend           │
                       │  • /api/* serverless funcs   │
                       │  • /data/ledger.json (CDN)   │◀── static fallback
                       └───────────┬──────────────────┘
                                   │ SQL
                                   ▼
                       ┌──────────────────────────────┐
                       │  Neon Postgres (Free)        │
                       │  0.5 GB · scale-to-zero      │
                       └───────────▲──────────────────┘
                                   │ writes
                       ┌───────────┴──────────────────┐
                       │  GitHub Actions (unlimited)  │
                       │  • ingest fixtures/results   │
                       │  • generate predictions      │
                       │  • grade + update ledger     │
                       │  • commit ledger snapshot    │
                       │  • daily email (Resend)      │
                       └───────────┬──────────────────┘
                                   │ HTTPS
                                   ▼
                    football-data.org (free) · The Odds API (free)
```

**No always-on server.** The Express app splits in two: read endpoints become
Vercel serverless functions; the scheduler's 17 `cron.schedule` jobs and 2
60-second polling loops become scheduled GitHub Actions workflows.

### Verified free-tier limits

| Layer | Service | Limit | Our need | Headroom |
|---|---|---|---|---|
| Frontend + API | Vercel Hobby | 1M invocations, 120s timeout, 100 GB transfer | negligible traffic | large |
| Database | Neon Free | 0.5 GB, 100 CU-hrs/mo, scale-to-zero @ 5 min | small tables | adequate |
| Scheduler | GitHub Actions | **unlimited** (repo is public) | ~150 runs/day | unbounded |
| Fixtures/results | football-data.org Free | 10 calls/min, 12 competitions | ~1 call/10 min | very large |
| Odds | The Odds API Free | 500 credits/mo | 2 pulls/day ≈ 120/mo | adequate |
| Email | Resend Free | 3,000/mo, 100/day | low | large |

Neon Free is explicitly *"permanent (not a trial); no credit card required"* —
this is what replaces Render Postgres, whose free plan expires 30 days after
creation, offers no backups, and is deleted after a 14-day grace period.

**Fixture ingestion is a single API call.** football-data.org accepts a
multi-competition filter (`competitions=PL,PD,BL1,SA,FL1,CL,DED,PPL,ELC`), a
pattern the existing `livePollLoop` already uses. At a 10-minute ingest cadence
that is roughly one call per 10 minutes against a 10-per-minute ceiling.

---

## 4. Key design decisions

### 4.1 Static ledger snapshot — resilience and a trap fix in one

GitHub documents a trap that would silently kill this design:

> In a public repository, scheduled workflows are automatically disabled when
> no repository activity has occurred in 60 days.

Set this up, stop committing for two months, and every cron stops.

**Decision:** the nightly workflow commits `frontend/public/data/ledger.json`
to the repo on every run. This solves two problems at once:

1. The commit is repository activity, so the 60-day clock never expires.
2. The ledger renders from a static file on Vercel's CDN, so the public track
   record survives Neon being asleep, over quota, or gone entirely.

This directly addresses the failure that caused today's outage: one suspended
service took down everything. After this, the page that matters cannot go dark.

The social pipeline already proves the pattern — `oddyessa-bot` commits to the
`social-assets` branch on a schedule.

### 4.2 WebSockets are removed

Vercel serverless functions cannot hold WebSocket connections. `useRealTime.js`
switches to polling `/api/fixtures/live`. Nothing real is lost: football-data's
free tier serves **delayed scores**, so sub-minute push had no live data to
carry anyway.

### 4.3 Anthropic off at launch

Pay-per-token is the only non-zero line item. `NARRATIVE_POLISH=off` and the
`/ai/*` routes gated behind a flag defaulting to off. If re-enabled later,
narratives should be precomputed in the nightly Action for settled matches only
and cached in `ai_analysis_cache` — bounded to roughly $1/mo rather than
per-pageview.

### 4.4 Same-origin API

Frontend drops `VITE_API_URL` and calls same-origin `/api`. This removes the
CORS failures visible in production today as a side effect.

### 4.5 Admin dashboard must survive serverless

The CEO dashboard currently shows no metrics. The immediate cause is the
outage — `adminClient.js` points at the suspended Render host. But restoring
the backend is **not sufficient**: three parts of the admin stack are built on
in-process state that cannot work on serverless functions.

**Blocker — auth is in-memory.** `routes/admin.js` states its own model:

> A correct `ADMIN_PASSWORD` mints a random in-memory session token
> (invalidated on server restart).

Every serverless invocation may be a fresh instance, so a minted token would
not be recognised by the next request. Login would succeed and every
subsequent call would 401. **The dashboard would be unusable.**

*Decision:* replace the in-memory token store with a **stateless signed token** —
an HMAC over an expiry timestamp using a server-side secret. No database, no
external dependency, no session store, and it verifies identically on any
instance. `ADMIN_PASSWORD` remains the single credential.

**Broken panels.** These read in-process state that resets per invocation:

| Field | Source | Fate |
|---|---|---|
| `liveHealth` | `getApiHealth()` in-memory counters | Replace with `api_usage_log` aggregates |
| `uptimeSeconds` | process uptime | Replace with "last successful ingest" from DB |
| `wsClients` | WebSocket client count | Remove — WebSockets are gone (§4.2) |
| `memory` | process RSS | Remove — meaningless per-invocation |

**Metrics that already survive.** `recordApiCall()` writes to `api_usage_log`,
and cost tracking writes to `api_cost_log`. Because these are DB-backed rather
than in-memory, they keep working — **provided the GitHub Actions jobs connect
to the same Neon `DATABASE_URL`.** The data-source API calls move from the web
server into the Actions runner, so if the runner is not wired to Neon, the
usage and spend panels stay permanently empty even after a successful revival.
This is a required, easily-missed wiring step.

**Connections panel is stale.** It hardcodes `API-Football (Pro)` and
`The Odds API (20k)` as `Paid`, and reads `APISPORTS_KEY` — both of which this
design removes. It must be rewritten to reflect the actual stack:
football-data.org (free), The Odds API (free), Neon, GitHub Actions.

---

## 5. What free costs us

Accepted trade-offs, recorded so they are not rediscovered as bugs:

- **Scores are delayed, not live.** Live scores are €12/mo on football-data.org.
  Grading happens after full time and is unaffected; the in-play board is the
  only casualty.
- **Odds refresh ~twice daily**, not per-click (500 credits/mo).
- **Match pages lose xG, lineups and injuries** — these came from API-Football.
- **No AI verdicts or chat** until the flag is turned on.
- **Cron granularity ~10 minutes**, and GitHub delays scheduled runs under load.
  Schedule off the top of the hour.
- **Neon cold start** (~sub-second) on the first query after 5 minutes idle.

**Vercel Hobby is licensed for non-commercial use only.** Compliant today.
The day Oddyessa charges anyone, this becomes Pro at $20/mo.

**Only unavoidable cost: the `oddyessa.com` domain, ~$12–15/year.**

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Render DB already deleted → ledger lost | **Critical** | Phase 0 rescue, immediately. See §7. |
| Neon 0.5 GB exceeded | Medium | Migrate only required tables; prune `api_cache` and `site_events`. |
| GitHub disables crons after 60 quiet days | Medium | Snapshot commit each run (§4.1). |
| Scheduled run delayed/dropped under load | Low | Jobs idempotent; schedule off the hour. |
| Odds free tier exhausted | Low | Hard-cap to 2 pulls/day; engine already tolerates missing odds. |
| Vercel function cold start | Low | Static snapshot serves the ledger regardless. |
| Actions runner not wired to Neon → usage/spend panels stay empty | Medium | Explicit `DATABASE_URL` secret on every workflow; assert rows written in Phase 6. |
| In-memory admin token 401s every request on serverless | **High** | Stateless signed token (§4.5) — must land before the dashboard is usable. |

---

## 7. Phases

**Phase 0 — Rescue and prepare (urgent).**
The only step with a deletion clock. Check `dashboard.render.com` for the
**database** (not the suspended web service). If reachable:

```bash
pg_dump "$DATABASE_URL" -Fc -f ~/Desktop/oddyessa-ledger-2026-09-02.dump
```

If it is gone, the record is partially reconstructable from
`origin/social-assets:state/posted.json` (111 receipt ids, 135 log entries with
scorelines and timestamps) plus the rendered cards and the vault's Full-Time
Report — but **not the Brier components**, which exist only in Postgres.

Also in Phase 0: branch fresh off `origin/main` (`85a9c71`). The local checkout
is on `feat/fanbrain-diagnostics` (`0e73ad3`) with uncommitted social-workflow
edits, and is a stale mirror.

**Phase 1 — Neon.** Create project, apply `backend/db/schema.sql`, restore the
dump, prune to fit 0.5 GB, verify the engine reads `team_season_stats`.

**Phase 2 — Vercel functions.** Wrap the existing Express app as a single
serverless function: strip `app.listen`, remove `node-cron` bootstrapping,
remove the WebSocket server. Point the frontend at same-origin `/api`.

**Phase 3 — GitHub Actions engine.** Port the scheduler's jobs to workflows:
fixture/result ingest, prediction generation, grading, daily email, and the
ledger snapshot commit.

**Phase 4 — Static fallback + polling.** Ledger page reads
`/data/ledger.json` with the API as enhancement; live board polls.

**Phase 5 — League reconfiguration and quota trim.** Remove `EL` and
`APF_LEAGUES`, add `DED`/`PPL`/`ELC`, cap the odds cadence, dormant-ise WC paths.

**Phase 6 — Admin dashboard (§4.5).** Stateless signed admin token; replace
`liveHealth`/`uptimeSeconds` with DB-derived equivalents; drop `wsClients` and
`memory`; rewrite the connections panel for the new stack; verify the Actions
runner writes `api_usage_log` to Neon so usage and spend populate.

Phases 2–4 and 6 are the substantive work; estimate one to two focused days.

---

## 8. Success criteria

1. `oddyessa.com` renders the full World Cup ledger with the correct Brier
   figure, with **no** backend running.
2. Fixtures and predictions appear for the nine in-scope competitions.
3. A finished match is graded and appears in the ledger without manual action.
4. Recurring spend is **$0/month** excluding the domain.
5. Killing Neon does not blank the ledger page.
6. No service in the stack can be suspended for exceeding a free quota.
7. Admin login persists across requests, and the dashboard shows real
   numbers — traffic, model performance, API usage and spend — with no panel
   reading in-process state.

---

## 9. Open questions

1. **Is the Render database reachable?** Determines whether Phase 1 is a
   restore or a rebuild. Blocking for Phase 1 only.
2. Should `BSA` (Brasileirão) stay in the ingest set? Free, already flowing,
   out of the stated European scope. Default: retain code path, do not feature.
3. Should the daily email resume at launch, or stay off until there is an
   audience beyond the 2 Telegram subscribers? Default: build it, leave
   disabled.
