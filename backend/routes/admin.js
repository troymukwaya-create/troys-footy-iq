// ─── CEO COMMAND CENTER — ADMIN API ─────────────────────────────────
// All endpoints here are PROTECTED by a bearer token issued at /login.
//
//   POST /api/admin/login            → { token }           (public)
//   GET  /api/admin/overview         → headline KPIs        (auth)
//   GET  /api/admin/traffic          → visitor analytics    (auth)
//   GET  /api/admin/api-health       → quota + Claude spend  (auth)
//   GET  /api/admin/system           → infra health         (auth)
//   GET  /api/admin/alerts           → recent system alerts  (auth)
//   POST /api/admin/alerts/:id/ack   → acknowledge an alert  (auth)
//
// Auth model: single CEO user. A correct ADMIN_PASSWORD mints a random
// in-memory session token (invalidated on server restart). No external
// dependency, no password stored client-side.

import { Router } from 'express';
import { safeQuery, isDbAvailable, getDbMetrics } from '../db/index.js';
import {
  getRecentAlerts, acknowledgeAlert,
  getApiUsageStats, getApiCostStats, getApiHealth,
} from '../services/monitor.js';
import {
  getClientCount, getUptimeSeconds, getMemoryMB,
} from '../services/runtimeStats.js';
import { mintToken, passwordMatches, requireAuth } from '../services/adminAuth.js';

const router = Router();

// Real site traffic excludes the CEO's own /admin views. When ?demo=1 we
// also include synthetic (seeded) rows so the dashboard can be explored
// with sample data; by default only REAL visitors are counted.
const REAL_TRAFFIC = `path NOT LIKE '/admin%'`;
const demoClause = (req) => (req.query.demo === '1' ? '' : ' AND synthetic = false');

// ─── POST /login ────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({
      error: true,
      message: 'Admin access not configured. Set ADMIN_PASSWORD in backend/.env.',
    });
  }
  const { password } = req.body || {};
  if (!passwordMatches(password)) {
    return res.status(401).json({ error: true, message: 'Incorrect password' });
  }
  res.json({ error: false, token: mintToken() });
});

// All routes below require auth.
router.use(requireAuth);

// ─── GET /overview ──────────────────────────────────────────────────
// The single glance: who's here now, today's traffic, model state, alerts.
router.get('/overview', async (req, res) => {
  try {
    const dbUp = isDbAvailable();
    const out = {
      dbConnected: dbUp,
      generatedAt: new Date().toISOString(),
      worldCupLive: new Date() >= new Date('2026-06-11T00:00:00Z'),
      demoMode: req.query.demo === '1',
    };

    if (dbUp) {
      const traffic = await safeQuery(`
        SELECT
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes')  AS live_visitors,
          COUNT(*)                   FILTER (WHERE event_name = '$pageview' AND created_at >= CURRENT_DATE) AS views_today,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= CURRENT_DATE)                   AS visitors_today,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')      AS visitors_week
        FROM site_events
        WHERE ${REAL_TRAFFIC}${demoClause(req)}
      `);

      // How much DEMO (synthetic) data exists — drives the honesty banner.
      const demo = await safeQuery(`SELECT COUNT(*)::int AS n FROM site_events WHERE synthetic = true`);
      out.demoEvents = demo?.rows?.[0]?.n || 0;

      const preds = await safeQuery(`
        SELECT
          (SELECT COUNT(*) FROM predictions)::int                                            AS total_predictions,
          (SELECT COUNT(*) FROM predictions WHERE actual_result IS NULL)::int                AS pending_predictions,
          (SELECT COUNT(*) FROM predictions WHERE created_at >= CURRENT_DATE)::int           AS predictions_today,
          (SELECT ROUND(AVG(brier_score)::numeric, 4) FROM model_performance)                AS avg_brier,
          (SELECT ROUND(AVG(CASE WHEN prediction_correct THEN 100.0 ELSE 0 END)::numeric, 1)
             FROM model_performance WHERE created_at >= NOW() - INTERVAL '7 days')           AS win_rate_week
      `);

      const alerts = await safeQuery(
        `SELECT COUNT(*)::int AS n FROM system_alerts WHERE acknowledged = false`
      );

      const t = traffic?.rows?.[0] || {};
      const p = preds?.rows?.[0] || {};
      out.traffic = {
        liveVisitors: Number(t.live_visitors || 0),
        viewsToday: Number(t.views_today || 0),
        visitorsToday: Number(t.visitors_today || 0),
        visitorsWeek: Number(t.visitors_week || 0),
      };
      out.predictions = {
        total: p.total_predictions || 0,
        pending: p.pending_predictions || 0,
        today: p.predictions_today || 0,
        avgBrier: p.avg_brier != null ? Number(p.avg_brier) : null,
        winRateWeek: p.win_rate_week != null ? Number(p.win_rate_week) : null,
      };
      out.openAlerts = alerts?.rows?.[0]?.n || 0;
    }

    res.json({ error: false, data: out });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /traffic ───────────────────────────────────────────────────
// Visitor analytics: 24h timeline, top countries, devices, events, matches.
router.get('/traffic', async (req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, data: { available: false } });
    const F = `${REAL_TRAFFIC}${demoClause(req)}`;   // shared real-traffic filter

    const hourly = await safeQuery(`
      SELECT date_trunc('hour', created_at) AS hour,
             COUNT(*) FILTER (WHERE event_name = '$pageview')::int AS views,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events
      WHERE ${F} AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1 ORDER BY 1
    `);

    const countries = await safeQuery(`
      SELECT COALESCE(country, 'Unknown') AS country, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events
      WHERE ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY visitors DESC LIMIT 8
    `);

    const devices = await safeQuery(`
      SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events
      WHERE ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY visitors DESC
    `);

    const referrers = await safeQuery(`
      SELECT CASE
               WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
               WHEN referrer LIKE '%google%' THEN 'Google'
               WHEN referrer LIKE '%t.co%' OR referrer LIKE '%twitter%' OR referrer LIKE '%x.com%' THEN 'X / Twitter'
               WHEN referrer LIKE '%facebook%' OR referrer LIKE '%instagram%' THEN 'Meta'
               WHEN referrer LIKE '%reddit%' THEN 'Reddit'
               ELSE 'Other'
             END AS source,
             COUNT(*)::int AS hits
      FROM site_events WHERE event_name = '$pageview' AND ${F} AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY hits DESC LIMIT 6
    `);

    const topMatches = await safeQuery(`
      SELECT props->>'home_team' AS home, props->>'away_team' AS away,
             COUNT(*)::int AS views
      FROM site_events
      WHERE event_name IN ('prediction_viewed','match_viewed')
        AND ${F} AND created_at >= CURRENT_DATE
        AND props->>'home_team' IS NOT NULL
      GROUP BY 1,2 ORDER BY views DESC LIMIT 6
    `);

    const engagement = await safeQuery(`
      SELECT event_name, COUNT(*)::int AS n
      FROM site_events
      WHERE ${F} AND created_at >= CURRENT_DATE AND event_name <> '$pageview'
      GROUP BY 1 ORDER BY n DESC
    `);

    res.json({ error: false, data: {
      available: true,
      hourly: hourly?.rows || [],
      countries: countries?.rows || [],
      devices: devices?.rows || [],
      referrers: referrers?.rows || [],
      topMatches: topMatches?.rows || [],
      engagement: engagement?.rows || [],
    }});
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /api-health ────────────────────────────────────────────────
// External API quota usage + Claude spend. Includes free-tier limits so
// the UI can render "X / limit" gauges.
const QUOTA_LIMITS = {
  apisports:    { dailyFree: 100,  label: 'API-Football' },
  footballdata: { perMinute: 10,   label: 'football-data.org' },
  anthropic:    { monthlyBudget: 100, label: 'Anthropic (Claude)' },
};

// Is an API key actually configured (wired) in this environment?
function keyWired(key, minLen = 10) {
  return !!(key && key.length >= minLen
    && !key.startsWith('YOUR') && !key.startsWith('PASTE') && !key.includes('placeholder'));
}

router.get('/api-health', async (_req, res) => {
  try {
    const [usage, cost] = await Promise.all([getApiUsageStats(), getApiCostStats()]);
    // Per-API connection status WITH real activity evidence (calls today, last
    // call) so the CEO can see each paid API is not just wired but ACTIVE.
    const sources = usage.sources || {};
    const now = Date.now();
    const conn = (wired, label, plan, usageKey, todayOverride) => {
      const u = sources[usageKey] || {};
      const callsToday = todayOverride != null ? todayOverride : (u.today || 0);
      const lastCall = u.lastCall || null;
      const recent = lastCall && (now - new Date(lastCall).getTime()) < 7 * 86400000;
      const active = !!(wired && (callsToday > 0 || recent));
      return {
        wired, label, plan, callsToday, callsMonth: u.month || 0, lastCall,
        active, status: !wired ? 'NOT_CONFIGURED' : active ? 'ACTIVE' : 'CONNECTED',
      };
    };
    const connections = {
      apisports:    conn(keyWired(process.env.APISPORTS_KEY),         'API-Football (Pro)',  'Paid',          'apisports'),
      theodds:      conn(keyWired(process.env.THE_ODDS_API_KEY),      'The Odds API (20k)',  'Paid',          'theodds'),
      footballdata: conn(keyWired(process.env.FOOTBALLDATA_TOKEN),    'football-data.org',   'Free tier',     'footballdata'),
      anthropic:    conn(keyWired(process.env.ANTHROPIC_API_KEY, 20), 'Anthropic (Claude)',  'Pay-as-you-go', 'anthropic', cost?.callsToday),
    };
    res.json({ error: false, data: {
      usage: usage.sources || {},
      cost,
      limits: QUOTA_LIMITS,
      liveHealth: getApiHealth(),
      connections,
    }});
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /system ────────────────────────────────────────────────────
// Infra health: DB, memory, uptime, websockets, last prediction run.
router.get('/system', async (_req, res) => {
  try {
    const data = {
      dbConnected: isDbAvailable(),
      db: getDbMetrics(),
      memory: getMemoryMB(),
      uptimeSeconds: getUptimeSeconds(),
      wsClients: getClientCount(),
      lastPredictionRun: null,
      errorsLast24h: 0,
    };

    if (isDbAvailable()) {
      const last = await safeQuery(`SELECT MAX(created_at) AS t FROM predictions`);
      data.lastPredictionRun = last?.rows?.[0]?.t || null;
      // Only UNACKNOWLEDGED criticals count — once the CEO has reviewed and
      // acknowledged a transient spike (e.g. a deploy-window blip), the
      // banner must go green, not stay red for a fixed 24 hours.
      const errs = await safeQuery(
        `SELECT COUNT(*)::int AS n FROM system_alerts
         WHERE severity = 'CRITICAL' AND acknowledged = false
           AND created_at >= NOW() - INTERVAL '24 hours'`
      );
      data.errorsLast24h = errs?.rows?.[0]?.n || 0;
    }

    res.json({ error: false, data });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── GET /alerts ────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const alerts = await getRecentAlerts(limit, req.query.unack === 'true');
    res.json({ error: false, data: alerts });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── POST /alerts/:id/ack ───────────────────────────────────────────
router.post('/alerts/:id/ack', async (req, res) => {
  try {
    await acknowledgeAlert(parseInt(req.params.id));
    res.json({ error: false, ok: true });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ─── POST /reset-analytics ──────────────────────────────────────────
// Wipes the DEMO/seed data so the dashboard shows only real visitors.
// Removes synthetic events + the sample rows seeded for the walkthrough.
router.post('/reset-analytics', async (_req, res) => {
  try {
    if (!isDbAvailable()) return res.json({ error: false, ok: false, message: 'No database' });
    await safeQuery(`DELETE FROM site_events WHERE synthetic = true`);
    await safeQuery(`TRUNCATE api_usage_log`);
    await safeQuery(`TRUNCATE api_cost_log`);
    await safeQuery(`DELETE FROM model_performance WHERE match_external_id LIKE 'wc-%'`);
    await safeQuery(`DELETE FROM predictions WHERE fixture_id IS NULL AND league_code = 'WC'`);
    await safeQuery(`DELETE FROM system_alerts WHERE source IN ('scheduler') OR alert_type = 'API_QUOTA'`);
    res.json({ error: false, ok: true });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});


// ─── POST /elo-bootstrap ────────────────────────────────────────────
// Replay the full international-results history through our Elo updater.
//   { action: 'dry-run' }  → comparison table vs the static snapshot (no writes)
//   { action: 'apply' }    → persist re-centered ratings to national_elo
//   { action: 'reset' }    → drop all learned overrides (back to snapshot)
// Takes ~30-60s (downloads + replays ~50k matches).
router.post('/elo-bootstrap', async (req, res) => {
  const action = (req.body?.action || 'dry-run').toLowerCase();
  try {
    const { runEloBootstrap, resetEloBootstrap } = await import('../services/eloBootstrap.js');
    if (action === 'reset') return res.json({ error: false, ...(await resetEloBootstrap()) });
    const result = await runEloBootstrap({ apply: action === 'apply' });
    res.json({ error: false, ...result });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
