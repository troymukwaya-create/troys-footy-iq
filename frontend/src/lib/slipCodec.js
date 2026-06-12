// ─── SLIP CODEC ──────────────────────────────────────────────────────
// Turns a parlay into something that travels: a short server code
// (oddyessa.com/?slip=K7M2QX) with a serverless fallback that encodes the
// whole slip into the URL fragment (#slip=od1.…). Opening either form
// restores the exact selections in the builder — the slip itself is the
// share object, not the homepage.
//
// Wire format v1 (fragment): "od1." + base64url(JSON [v, [legs…]]) where
// each leg is [matchId, matchLabel, marketType, outcome, odds, modelProb].
// Compact arrays keep a 3-leg slip around ~200 chars — WhatsApp-safe.

import client from '../api/client.js';

const FRAGMENT_PREFIX = 'od1.';
const MAX_LEGS = 6;
const MAX_LEG_ODDS = 15;

// ─── base64url helpers (unicode-safe) ───────────────────────────────
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ─── validation (mirror of the backend rails) ───────────────────────
function sanitizeLegs(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LEGS) return null;
  const legs = [];
  for (const l of raw) {
    const odds = Number(l?.odds);
    const matchLabel = String(l?.matchLabel || '').slice(0, 80).trim();
    const outcome = String(l?.outcome || '').slice(0, 60).trim();
    if (!Number.isFinite(odds) || odds < 1.01 || odds > MAX_LEG_ODDS || !matchLabel || !outcome) return null;
    const mp = Number(l?.modelProbability);
    legs.push({
      matchId: l?.matchId != null ? l.matchId : null,
      matchLabel,
      marketType: String(l?.marketType || '1X2').slice(0, 30),
      outcome,
      odds: Number(odds.toFixed(2)),
      modelProbability: Number.isFinite(mp) && mp > 0 && mp <= 1 ? mp : null,
    });
  }
  return legs;
}

// ─── fragment encode / decode ────────────────────────────────────────
export function encodeSlipFragment(legs) {
  const clean = sanitizeLegs(legs);
  if (!clean) return null;
  const compact = [1, clean.map(l => [l.matchId, l.matchLabel, l.marketType, l.outcome, l.odds, l.modelProbability])];
  return FRAGMENT_PREFIX + b64urlEncode(JSON.stringify(compact));
}

export function decodeSlipFragment(frag) {
  try {
    if (!frag || !frag.startsWith(FRAGMENT_PREFIX)) return null;
    const [v, rows] = JSON.parse(b64urlDecode(frag.slice(FRAGMENT_PREFIX.length)));
    if (v !== 1 || !Array.isArray(rows)) return null;
    return sanitizeLegs(rows.map(r => ({
      matchId: r[0], matchLabel: r[1], marketType: r[2], outcome: r[3], odds: r[4], modelProbability: r[5],
    })));
  } catch { return null; }
}

// ─── share URL (server code first, fragment fallback) ───────────────
// Never throws; always returns a working URL. The fragment fallback means
// a cold/unreachable backend only costs link prettiness.
export async function getShareUrl(legs, { evPct = null, visitor = null } = {}) {
  const origin = window.location.origin;
  const clean = sanitizeLegs(legs);
  if (!clean) return null;
  try {
    const res = await client.post('/slip-share', {
      legs: clean,
      evPct,
      visitor,
    }, { timeout: 4000 });
    if (res.data?.code) return { url: `${origin}/?slip=${res.data.code}`, code: res.data.code, kind: 'code' };
  } catch { /* fall through to fragment */ }
  const frag = encodeSlipFragment(clean);
  return frag ? { url: `${origin}/#slip=${frag}`, code: null, kind: 'fragment' } : null;
}

// ─── resolve from the current URL (app boot) ────────────────────────
// Supports ?slip=CODE (server) and #slip=od1.… (self-contained).
export async function loadSlipFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('slip');
    if (code && /^[2-9A-Za-z]{4,12}$/.test(code) && !code.startsWith(FRAGMENT_PREFIX)) {
      const res = await client.get(`/slip-share/${encodeURIComponent(code.toUpperCase())}`);
      const legs = sanitizeLegs(res.data?.legs);
      if (legs) return { legs, source: 'code' };
    }
  } catch { /* bad/expired code → fall through to fragment */ }
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const h = new URLSearchParams(hash.includes('=') ? hash : '');
    const frag = h.get('slip') || (hash.startsWith(FRAGMENT_PREFIX) ? hash : null);
    const legs = decodeSlipFragment(frag);
    if (legs) return { legs, source: 'fragment' };
  } catch { /* malformed fragment → no slip */ }
  return null;
}

// ─── canonical share text ────────────────────────────────────────────
// Legs FIRST, link LAST: many share targets keep only one of {text, url},
// so the message must carry the picks even if the link gets stripped —
// that was the original "it only shares the website" failure.
export function buildSlipText(legs, totals, url) {
  const lines = legs.map((l, i) => `${i + 1}. ${l.matchLabel} — ${l.outcome} @ ${Number(l.odds).toFixed(2)}`);
  const odds = totals?.combinedOdds ? ` @ ${totals.combinedOdds.toFixed(2)}×` : '';
  const edge = totals?.expectedValuePct != null
    ? `\nModel edge: ${totals.expectedValuePct > 0 ? '+' : ''}${totals.expectedValuePct.toFixed(0)}% vs the bookies` : '';
  return [
    `My slip · ${legs.length} leg${legs.length > 1 ? 's' : ''}${odds}`,
    '',
    ...lines,
    edge.trim() ? edge.trim() : null,
    '',
    url ? `Open it (picks load automatically): ${url}` : null,
    'via oddyessa.com · data, not betting advice · 18+',
  ].filter(x => x != null).join('\n');
}
