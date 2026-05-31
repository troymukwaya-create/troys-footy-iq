// ─── ANALYTICS (first-party, dependency-free) ───────────────────────
// Sends pageviews + key interactions to our own /api/track endpoint, which
// writes to the site_events table and powers the CEO dashboard.
//
// PostHog is OPTIONAL: if VITE_POSTHOG_KEY is set, we lazy-load posthog-js
// and mirror events there too. With no key, everything still works — the
// dashboard reads from our own database.

// Normalise the API base so /api/track always resolves — dev ('/api' via the
// Vite proxy) and prod (VITE_API_URL may be a bare host) both work.
const RAW_BASE = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/+$/, '')}/api`;

// ─── Stable anonymous IDs ───────────────────────────────────────────
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxxyxxx4xxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getVisitorId() {
  try {
    let id = localStorage.getItem('fiq_visitor');
    if (!id) { id = uuid(); localStorage.setItem('fiq_visitor', id); }
    return id;
  } catch { return 'anon'; }
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem('fiq_session');
    if (!id) { id = uuid(); sessionStorage.setItem('fiq_session', id); }
    return id;
  } catch { return 'anon'; }
}

// ─── Optional PostHog ───────────────────────────────────────────────
let _posthog = null;
async function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;
  try {
    // Computed specifier so Vite's static import-analysis can't try to
    // resolve/pre-bundle posthog-js when it isn't installed. PostHog is
    // strictly optional — enable it with `npm i posthog-js` + VITE_POSTHOG_KEY.
    const pkg = ['posthog', 'js'].join('-');
    const mod = await import(/* @vite-ignore */ pkg);
    _posthog = mod.default || mod;
    _posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
      autocapture: false,
      capture_pageview: false,   // we drive pageviews manually
      persistence: 'localStorage',
    });
  } catch {
    // posthog-js not installed — first-party tracking still works
    _posthog = null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────
export function initAnalytics() {
  getVisitorId();
  initPostHog();
  // Fire the first pageview once the app mounts.
  track('$pageview');
}

export function track(event, props = {}) {
  const payload = {
    event,
    visitorId: getVisitorId(),
    sessionId: getSessionId(),
    path: typeof location !== 'undefined' ? location.pathname : null,
    referrer: typeof document !== 'undefined' ? document.referrer : null,
    props,
  };

  // First-party (never blocks UI, never throws).
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/track`, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(`${API_BASE}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* ignore */ }

  // Mirror to PostHog if available.
  try { if (_posthog) _posthog.capture(event, props); } catch { /* ignore */ }
}

export function trackPageview() { track('$pageview'); }

export default { initAnalytics, track, trackPageview };
