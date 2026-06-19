// ─── CEO MISSION CONTROL — ops feed, tonight board, growth, buttons ──
// Everything the founder needs to SEE the machine run and PUSH on it.
//   GET  /api/admin/ops-feed     → unified event stream (locks, grades,
//                                  social posts, subscribers, slip funnel)
//   GET  /api/admin/tonight      → next 26h of WC fixtures with stage flags
//   GET  /api/admin/growth       → slip-share funnel + subscriber growth
//   GET  /api/admin/ops-config   → which control buttons can light up
//   POST /api/admin/dispatch-workflow → trigger a GitHub Action (needs
//                                  GITHUB_TOKEN in the backend env)
//   POST /api/admin/rescore      → run result ingestion now

import { Router } from 'express';
import { safeQuery, isDbAvailable } from '../db/index.js';
import { requireAuth } from '../services/adminAuth.js';
import { ingestResults } from '../services/resultService.js';
import { dispatchWorkflow, ALLOWED_WORKFLOWS } from '../services/githubDispatch.js';

const router = Router();
router.use(requireAuth);

const REPO = process.env.SOCIAL_REPO || 'troymukwaya-create/troys-footy-iq';
const STATE_URL = `https://raw.githubusercontent.com/${REPO}/social-assets/state/posted.json`;

// The social posted-state lives on GitHub (public branch) — cache it
// briefly so a feed poll doesn't hammer raw.githubusercontent.
let socialCache = { at: 0, log: [] };
async function getSocialLog() {
  if (Date.now() - socialCache.at < 20000) return socialCache.log;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(STATE_URL, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    socialCache = { at: Date.now(), log: Array.isArray(j.log) ? j.log : [] };
  } catch { socialCache = { at: Date.now(), log: socialCache.log }; }
  return socialCache.log;
}

// ─── GET /ops-feed ───────────────────────────────────────────────────
router.get('/ops-feed', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: [] });
    const hours = Math.min(168, parseInt(req.query.hours) || 48);
    const events = [];

    const locks = await safeQuery(`
      SELECT p.created_at AS at, p.model_version, p.prob_home, p.prob_draw, p.prob_away,
             ht.name AS home, at2.name AS away
      FROM predictions p
      JOIN fixtures f ON f.id = p.fixture_id
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at2 ON at2.id = f.away_team_id
      WHERE p.created_at > NOW() - ($1 || ' hours')::interval
        AND p.model_version IN ('wc-elo-market-v1','intl-elo-market-v1')
      ORDER BY p.created_at DESC LIMIT 40`, [hours]);
    for (const r of locks.rows) events.push({
      type: 'lock', at: r.at,
      label: `Forecast stored — ${r.home} v ${r.away} (${Math.round(r.prob_home)}/${Math.round(r.prob_draw)}/${Math.round(r.prob_away)})`,
    });

    const grades = await safeQuery(`
      SELECT p.evaluated_at AS at, p.actual_result, p.prob_home, p.prob_draw, p.prob_away,
             f.home_goals, f.away_goals, ht.name AS home, at2.name AS away
      FROM predictions p
      JOIN fixtures f ON f.id = p.fixture_id
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at2 ON at2.id = f.away_team_id
      WHERE p.evaluated_at IS NOT NULL AND p.evaluated_at > NOW() - ($1 || ' hours')::interval
      ORDER BY p.evaluated_at DESC LIMIT 40`, [hours]);
    for (const r of grades.rows) {
      const pred = r.prob_home >= r.prob_draw && r.prob_home >= r.prob_away ? 'HOME'
        : (r.prob_away >= r.prob_draw ? 'AWAY' : 'DRAW');
      const hit = r.actual_result === pred;
      events.push({
        type: 'grade', at: r.at, hit,
        label: `Graded — ${r.home} ${r.home_goals ?? '?'}–${r.away_goals ?? '?'} ${r.away}: call ${hit ? 'HIT' : 'MISSED'}`,
      });
    }

    const subs = await safeQuery(`
      SELECT created_at AS at, source, email FROM subscribers
      WHERE created_at > NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC LIMIT 30`, [hours]);
    for (const r of subs.rows) {
      const masked = String(r.email || '').replace(/^(..).*(@.*)$/, '$1…$2');
      events.push({ type: 'subscriber', at: r.at, label: `New subscriber ${masked}${r.source ? ` (${r.source})` : ''}` });
    }

    const mails = await safeQuery(`
      SELECT created_at AS at, kind, recipients FROM email_log
      WHERE created_at > NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC LIMIT 10`, [hours]);
    for (const r of mails.rows) events.push({ type: 'email', at: r.at, label: `Email sent — ${r.kind} to ${r.recipients}` });

    const slipEvents = await safeQuery(`
      SELECT created_at AS at, event_name, props FROM site_events
      WHERE event_name IN ('slip_transfer_opened','slip_shared','slip_link_opened','slip_link_created','slip_bookie_opened','slip_bookie_selected')
        AND created_at > NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC LIMIT 50`, [hours]);
    const SLIP_LABEL = {
      slip_transfer_opened: (p) => `Slip transfer opened (${p?.legs || '?'} legs)`,
      slip_shared: (p) => `Slip shared via ${p?.method || '?'}`,
      slip_link_created: (p) => `Slip link minted (${p?.kind || ''})`,
      slip_link_opened: (p) => `Shared slip OPENED (${p?.legs || '?'} legs · ${p?.source || ''})`,
      slip_bookie_opened: (p) => `Bookmaker click-out → ${p?.bookie || '?'}`,
      slip_bookie_selected: (p) => `Bookmaker picked: ${p?.bookie || '?'}`,
    };
    for (const r of slipEvents.rows) events.push({
      type: 'growth', at: r.at,
      label: (SLIP_LABEL[r.event_name] || (() => r.event_name))(r.props),
    });

    const social = await getSocialLog();
    for (const e of social) {
      if (e.at && new Date(e.at).getTime() > Date.now() - hours * 3600 * 1000) {
        events.push({ type: 'social', at: e.at, label: `${e.kind === 'prematch' ? 'Pre-match call posted' : 'Receipt posted'} — ${e.label || e.id} (TG/X/IG)` });
      }
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({ error: false, data: events.slice(0, 120) });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /tonight ────────────────────────────────────────────────────
router.get('/tonight', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: [] });
    const rows = await safeQuery(`
      SELECT f.external_id AS id, f.match_date AS ko, f.status, f.home_goals, f.away_goals,
             ht.name AS home, at2.name AS away,
             p.prob_home, p.prob_draw, p.prob_away, p.evaluated_at, p.risk_level
      FROM fixtures f
      JOIN leagues l ON l.id = f.league_id AND l.code = 'WC'
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at2 ON at2.id = f.away_team_id
      LEFT JOIN LATERAL (
        SELECT * FROM predictions p2 WHERE p2.fixture_id = f.id
          AND p2.model_version = 'wc-elo-market-v1'
        ORDER BY p2.created_at DESC LIMIT 1
      ) p ON true
      WHERE f.match_date > NOW() - interval '6 hours'
        AND f.match_date < NOW() + interval '26 hours'
      ORDER BY f.match_date ASC LIMIT 12`);
    const social = await getSocialLog();
    const posted = (kind, id) => social.some(e => e.kind === kind && e.id === id);
    res.json({
      error: false,
      data: rows.rows.map(r => ({
        id: r.id, ko: r.ko, status: r.status, home: r.home, away: r.away,
        homeGoals: r.home_goals, awayGoals: r.away_goals,
        probs: r.prob_home != null ? { home: r.prob_home, draw: r.prob_draw, away: r.prob_away } : null,
        risk: r.risk_level,
        stages: {
          priced: r.prob_home != null,
          callPosted: posted('prematch', r.id),
          live: ['IN_PLAY', 'PAUSED', 'LIVE'].includes(r.status),
          graded: !!r.evaluated_at,
          receiptPosted: posted('match', r.id),
        },
      })),
    });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /growth ─────────────────────────────────────────────────────
router.get('/growth', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: null });
    const slips = await safeQuery(`
      SELECT COUNT(*)::int AS created, COALESCE(SUM(hits),0)::int AS opens FROM shared_slips`);
    const topCodes = await safeQuery(`
      SELECT code, hits, combined_odds, created_at FROM shared_slips
      ORDER BY hits DESC, created_at DESC LIMIT 5`);
    const funnel = await safeQuery(`
      SELECT event_name, COUNT(*)::int AS n FROM site_events
      WHERE event_name IN ('slip_transfer_opened','slip_shared','slip_link_opened','slip_bookie_opened')
        AND created_at > NOW() - interval '7 days'
      GROUP BY event_name`);
    const subs = await safeQuery(`
      SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
             COUNT(*) FILTER (WHERE created_at > NOW() - interval '7 days')::int AS last7d
      FROM subscribers`);
    res.json({
      error: false,
      data: {
        slips: { ...slips.rows[0], top: topCodes.rows },
        funnel7d: Object.fromEntries(funnel.rows.map(r => [r.event_name, r.n])),
        subscribers: subs.rows[0],
      },
    });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── GET /ops-config — which buttons can light up ────────────────────
router.get('/ops-config', (_req, res) => {
  res.json({
    error: false,
    data: {
      ghToken: !!process.env.GITHUB_TOKEN,
      repo: REPO,
      emailEnabled: !!process.env.RESEND_API_KEY,
    },
  });
});

// ─── POST /dispatch-workflow — push a GitHub Actions button ──────────
// Shares services/githubDispatch.js with the social heartbeat cron.
router.post('/dispatch-workflow', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) return res.status(400).json({ error: true, message: 'GITHUB_TOKEN not set in backend env' });
    const { workflow, inputs } = req.body || {};
    if (!ALLOWED_WORKFLOWS.has(workflow)) return res.status(400).json({ error: true, message: 'unknown workflow' });
    const out = await dispatchWorkflow(workflow, inputs || {});
    if (out.ok) return res.json({ error: false, ok: true });
    res.status(502).json({ error: true, message: out.message });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

// ─── POST /rescore — run result ingestion now ────────────────────────
router.post('/rescore', async (req, res) => {
  try {
    const days = Math.min(7, parseInt(req.body?.days) || 2);
    const out = await ingestResults(days);
    res.json({ error: false, data: out || { ok: true } });
  } catch (err) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
