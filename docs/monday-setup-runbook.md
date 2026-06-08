# Oddyessa — Monday Setup Runbook

Owner: Troy. Estimated total time: ~60–75 min, all on free tiers.
Goal: stop cold visitors seeing "Failed to load fixtures", turn on the support
page, get indexed by Google, and make the email signup actually deliver.

Placeholder names used below match what was wired into the frontend:
`VITE_SUPPORT_URL`, `REPLACE_ME_GSC_TOKEN`, `og-image.png`.

---

## 0. Why the "Failed to load fixtures" bounce happens (read first)

- The backend lives on Render's **free** tier. After ~15 min of no traffic it
  **spins the instance down**. The next request triggers a **cold start of
  ~40s** while Node boots.
- The frontend's main API client (`frontend/src/api/client.js`) uses a
  **strict 1-second timeout** (`timeout: 1000`). So a cold visitor's fixtures
  request times out long before the backend wakes, and the UI falls back to
  demo/empty — i.e. "Failed to load fixtures." That silently undercuts the
  honesty brand exactly when traffic spikes.
- Fix: an **external** uptime monitor pings the backend every 5 min so it
  never goes to sleep. (An internal self-ping can't help — once the instance
  is asleep, nothing is running to fire a timer.)

Backend health endpoint to ping: `https://troys-footy-iq-api.onrender.com/api/health`
→ returns `{ "ok": true, "ts": <epoch-ms> }`. (Added in `backend/server.js`.)

---

## 1. UptimeRobot — keep the backend awake (~10 min, free)

This is the single highest-impact task. Pinging every 5 min keeps Render warm.

1. Go to https://uptimerobot.com → **Sign up** (free plan = 50 monitors, 5-min
   interval). Verify your email.
2. Dashboard → **+ New monitor** (or "Add New Monitor").
3. Fill in:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Oddyessa API (keep-warm)`
   - **URL (or IP):** `https://troys-footy-iq-api.onrender.com/api/health`
   - **Monitoring interval:** `5 minutes` (the free-plan minimum — this is the
     value that matters; Render sleeps at ~15 min idle, so 5 min keeps it warm).
4. (Optional) Under **Select alert contacts to notify**, tick your email so you
   get a heads-up if the API actually goes down.
5. Click **Create Monitor**.
6. Verify: within ~5 min the monitor should flip to **Up** (green). Open the
   URL in a browser yourself once to confirm you see `{"ok":true,"ts":...}`.

Note: the very first ping after a long idle may itself take ~40s (it's the one
paying the cold-start). UptimeRobot may briefly mark it slow/down, then green.
That's expected — after that first wake it stays warm.

Alternative if you prefer: **cron-job.org** (also free).
1. https://cron-job.org → sign up → **Create cronjob**.
2. **Title:** `Oddyessa keep-warm`. **URL:**
   `https://troys-footy-iq-api.onrender.com/api/health`.
3. **Schedule:** Every 5 minutes. Save/enable.

### Bulletproof alternative (costs money, optional)
Upgrade the Render web service to the **Starter plan ($7/mo)**. Paid instances
**never sleep**, so there's no cold start and the uptime ping becomes optional.
Render dashboard → the `troys-footy-iq-api` service → **Settings → Instance Type
→ Starter**. Keep this in your back pocket for the World Cup traffic spike; the
free tier + UptimeRobot is fine to launch with.

---

## 2. Support page → set `VITE_SUPPORT_URL` (~15 min, free)

The frontend has a quiet "Support the project" line at the bottom of the
How-It-Works page that stays **hidden until you set `VITE_SUPPORT_URL`** (a Vercel
env var). Create a real support page, point the env var at it, and the line
appears automatically — no broken placeholder is ever shown to users.

### Option A — Ko-fi (fastest, no fees on one-off tips)
1. https://ko-fi.com → **Sign up**. Pick a handle, e.g. `oddyessa` →
   your page becomes `https://ko-fi.com/oddyessa`.
2. Settings → add a profile pic (reuse the Oddyessa "O" mark), a one-line bio
   ("AI football predictions, honestly scored"), and connect **PayPal** or
   **Stripe** under *Payments* so money can actually land.
3. Copy your page URL: `https://ko-fi.com/oddyessa`.

### Option B — Stripe Payment Link (cleaner checkout, small % fee)
1. https://dashboard.stripe.com → (create account / complete activation).
2. Left nav → **Payment links** → **+ New**.
3. Choose **"Customers choose what to pay"** (a donation) or a fixed amount
   (e.g. £3 "Buy us a data refresh"). Name it `Support Oddyessa`. Create.
4. Copy the generated link, e.g. `https://buy.stripe.com/xxxxxxxx`.

### Wire it into Vercel (same for either option)
1. https://vercel.com → your Oddyessa project → **Settings → Environment
   Variables**.
2. **Add New:**
   - **Key:** `VITE_SUPPORT_URL`
   - **Value:** the URL from A or B (e.g. `https://ko-fi.com/oddyessa`)
   - **Environments:** tick **Production** (and Preview if you want).
   - Save.
3. Vite only injects env vars at **build time**, so you must **redeploy**:
   Vercel → **Deployments** → latest → **⋯ → Redeploy** (or push a commit).
4. Verify: after redeploy, open `/how-it-works` on the live site and scroll to
   the bottom — the "Support the project" line should now appear and open your
   Ko-fi/Stripe page.

---

## 3. Google Search Console — get indexed (~15 min, free)

Two parts: prove you own oddyessa.com, then hand Google your sitemap.

### Verify ownership
1. https://search.google.com/search-console → **Add property**.
2. Easiest with the current setup: choose the **URL prefix** property and enter
   `https://oddyessa.com`.
3. Google offers verification methods. Pick **one**:

   **Method A — HTML tag (uses `REPLACE_ME_GSC_TOKEN`):**
   - Google shows a tag like
     `<meta name="google-site-verification" content="AbC123_realToken" />`.
   - Copy just the token value (the `content="..."` part).
   - In `frontend/index.html`, replace `REPLACE_ME_GSC_TOKEN` with that real
     token (the meta tag with that placeholder is already in the `<head>`).
     Commit → Vercel redeploys.
   - Back in Search Console, click **Verify**.

   **Method B — DNS (no code change; better if you prefer not to touch HTML):**
   - Switch to a **Domain** property instead and choose **DNS TXT record**.
   - Copy the `google-site-verification=...` TXT value.
   - Add it as a **TXT record** at your domain registrar / DNS host for
     `oddyessa.com`. Save, wait a few minutes for propagation.
   - Click **Verify**. (DNS verifies the whole domain incl. subdomains.)

### Submit the sitemap
1. Once verified: Search Console left nav → **Sitemaps**.
2. Under "Add a new sitemap", enter `sitemap.xml` (so the full URL reads
   `https://oddyessa.com/sitemap.xml`) → **Submit**.
3. Status should become **Success** (may take a little while to fetch).
   `frontend/public/sitemap.xml` and `robots.txt` now exist, so this will
   resolve once the site is redeployed. Still add `og-image.png` (below) so the
   social card referenced in `<head>` renders.

---

## 4. Email delivery — make the signup actually send (~15 min, free)

Important: the signup form does **not** post to a third-party email tool. Here's
the real wiring so you change the right thing.

What actually happens today:
- `frontend/src/components/EmailCapture.jsx` POSTs to **our own backend**:
  `POST {VITE_API_URL}/api/subscribe` (it deliberately bypasses the 1s client).
- `backend/routes/subscribe.js` stores the email in **Postgres** (the
  `subscribers` table) and then tries to send a welcome email via
  `backend/services/email.js`.
- `backend/services/email.js` is a thin wrapper around **Resend**
  (`https://api.resend.com/emails`). It **no-ops** unless `RESEND_API_KEY` is
  set — emails are still *captured* in the DB, they just don't *send*.

So "connect an email tool" here = **set up Resend and add the keys to Render.**
(Beehiiv/MailerLite would be a *different, future* integration — the code as
written speaks Resend. Don't wire those today; use Resend to match the code.)

### Steps
1. **Database must be live first.** `/api/subscribe` returns `503 unavailable`
   if `DATABASE_URL` isn't connected. `render.yaml` already wires
   `DATABASE_URL` from the free `troys-footy-iq-db` Postgres, so confirm the DB
   shows **Available** in the Render dashboard and that the `subscribers` table
   exists (the backend creates/migrates it on boot — check the deploy logs).
   Quick check: open
   `https://troys-footy-iq-api.onrender.com/health` and confirm
   `env.dbConnected: true`.
2. **Create a Resend account:** https://resend.com → sign up (free tier:
   3,000 emails/mo, 100/day).
3. **Add & verify your domain:** Resend → **Domains → Add Domain** →
   `send.oddyessa.com` (this matches the code's default
   `EMAIL_FROM = "Oddyessa <picks@send.oddyessa.com>"`). Resend shows DKIM/SPF
   (and MX) **DNS records** — add them at your domain host for
   `oddyessa.com`. Wait for Resend to show the domain **Verified** (green).
   - If you'd rather use a different from-address, set `EMAIL_FROM` (below) to
     a domain you verify instead.
4. **Create an API key:** Resend → **API Keys → Create API Key** (Sending
   permission). Copy it (starts `re_...`) — shown once.
5. **Add the keys to Render** (NOT Vercel — this is backend):
   Render dashboard → `troys-footy-iq-api` → **Environment** → **Add
   Environment Variable**:
   - `RESEND_API_KEY` = `re_...` (the key from step 4)
   - `EMAIL_FROM` = `Oddyessa <picks@send.oddyessa.com>` (only needed if you
     used a different verified domain; otherwise the code default is fine)
   - Save → Render **redeploys** automatically.
   - Note: these two are **not** in `render.yaml` yet, so you must add them in
     the dashboard (or add them to `render.yaml` as `sync: false` keys later).
6. **Verify end-to-end:** on the live site, submit your own email in the signup
   box. You should (a) see the "You're in" success state, and (b) receive the
   welcome email within ~1 min. If no email arrives, check Render logs for
   `[email] RESEND_API_KEY not set` (key didn't load) or a Resend send error,
   and confirm the domain is Verified in Resend.

---

## Quick checklist

- [ ] UptimeRobot monitor on `/api/health`, 5-min interval, showing **Up**.
- [ ] `VITE_SUPPORT_URL` set in Vercel → redeployed → "Support the project" line
      appears at the bottom of `/how-it-works` and opens the real page.
- [ ] GSC property verified (token in `index.html` **or** DNS) and
      `sitemap.xml` submitted.
- [ ] DB **Available**; `RESEND_API_KEY` (+ verified domain) set in **Render**;
      test signup delivers a welcome email.
- [ ] Add `frontend/public/og-image.png` (1200×630) so shared links show a card.
- [ ] (Optional, bulletproof) Render web service upgraded to **Starter $7/mo**
      so it never sleeps.

## Costs summary

| Item | Cost |
|------|------|
| UptimeRobot / cron-job.org | Free |
| Ko-fi | Free (Stripe/PayPal take their cut on payouts) |
| Stripe Payment Link | Free to set up; ~standard % per transaction |
| Google Search Console | Free |
| Resend | Free (3,000/mo, 100/day) |
| Render web service (optional, removes cold start) | $7/mo |

---

## Optional cleanup (later, not urgent)

`backend/server.js` (~lines 324–330) has an internal `setInterval` self-ping to
`/health` every 12 min in production. It does **not** prevent Render's free-tier
cold-start (once the instance sleeps, the timer isn't running to fire), so it
gives a false impression of keeping the app warm. The UptimeRobot monitor above
is the real fix. You can safely delete that self-ping block later to avoid
confusion — left in place for now.
