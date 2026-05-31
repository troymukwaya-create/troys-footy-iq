// ─── FIRST-PARTY ANALYTICS INGESTION ────────────────────────────────
// POST /api/track   → record a visitor event (pageview / interaction)
//
// Public, unauthenticated, deliberately tiny and forgiving. The frontend
// analytics wrapper calls this on every pageview and key interaction.
// Everything is best-effort: a tracking failure must NEVER affect the user.
//
// This gives the CEO dashboard real traffic data with zero external
// dependency. PostHog, if configured, runs alongside — not instead.

import { Router } from 'express';
import { safeQuery, isDbAvailable } from '../db/index.js';

const router = Router();

const ALLOWED_EVENTS = new Set([
  '$pageview',
  'prediction_viewed',
  'ai_analysis_opened',
  'match_viewed',
  'parlay_add_pick',
  'share_clicked',
  'brier_score_viewed',
  'league_selected',
]);

// Best-effort country + device extraction from proxy headers / UA.
function detectCountry(req) {
  return (
    req.headers['cf-ipcountry'] ||              // Cloudflare
    req.headers['x-vercel-ip-country'] ||       // Vercel
    req.headers['x-country-code'] ||
    null
  );
}

function detectDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobi|android|iphone/.test(s)) return 'mobile';
  return 'desktop';
}

// Known bots / crawlers / preview fetchers — excluded for visitor accuracy.
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|outbrain|headless|lighthouse|gtmetrix|pingdom|uptimerobot|curl|wget|python-requests|axios|node-fetch|go-http|monitor|preview|scan/i;
function isBot(ua = '') { return !ua || BOT_RE.test(ua); }

function detectBrowser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function detectOS(ua = '') {
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

const clamp = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

router.post('/', async (req, res) => {
  // Always 204 fast — the client never waits on analytics.
  res.status(204).end();

  try {
    if (!isDbAvailable()) return;
    const ua = req.headers['user-agent'] || '';
    if (isBot(ua)) return;                          // drop bots/crawlers for accuracy
    const b = req.body || {};
    const event = String(b.event || '$pageview');
    if (!ALLOWED_EVENTS.has(event)) return;
    if (!b.visitorId) return;

    await safeQuery(
      `INSERT INTO site_events
         (visitor_id, session_id, event_name, path, referrer, country, device, browser, os, props, synthetic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)`,
      [
        clamp(String(b.visitorId), 40),
        clamp(b.sessionId ? String(b.sessionId) : null, 40),
        clamp(event, 60),
        clamp(b.path, 300),
        clamp(b.referrer, 300),
        clamp(detectCountry(req), 60),
        detectDevice(ua),
        detectBrowser(ua),
        detectOS(ua),
        b.props && typeof b.props === 'object' ? JSON.stringify(b.props) : null,
      ]
    );
  } catch {
    // swallow — analytics must never surface an error
  }
});

export default router;
