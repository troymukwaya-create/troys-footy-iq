// ─── DAILY SOCIAL PUBLISHER ─────────────────────────────────────────
// Posts what generate.mjs produced. Env-gated per platform: a platform
// without its secrets is skipped with a notice, never an error — so the
// pipeline ships before every account exists and lights up one by one.
//
//   node publish.mjs ledger|picks|match
//
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL
//          X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
const kind = process.argv[2];
if (!['ledger', 'picks', 'match', 'prematch'].includes(kind)) { console.error('usage: node publish.mjs ledger|picks|match|prematch'); process.exit(1); }

const payloadPath = path.join(OUT, `${kind}.json`);
if (!existsSync(payloadPath)) { console.error(`missing ${payloadPath} — run generate.mjs first`); process.exit(1); }
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (payload.skip) { console.log(`nothing to post (${payload.reason})`); process.exit(0); }

const images = (payload.images || []).map(n => path.join(OUT, n)).filter(existsSync);

// Which platforms to (re)post this tick + the item id, stamped by
// matchday.mjs. Defaults to all platforms for the daily ledger/picks runs
// (which don't carry per-platform state).
const ALL_PLATFORMS = ['telegram', 'x', 'instagram'];
const ONLY = Array.isArray(payload._only) ? payload._only : ALL_PLATFORMS;
const ITEM_ID = payload._id || null;

// ─── Telegram ───────────────────────────────────────────────────────
async function postTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN, chan = process.env.TELEGRAM_CHANNEL;
  if (!token || !chan) { console.log('telegram: secrets missing — skipped'); return 'skip'; }
  const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

  const multipart = (fields, files) => {
    const b = crypto.randomUUID().replace(/-/g, '');
    const parts = [];
    for (const [k, v] of Object.entries(fields))
      parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    for (const [k, file] of Object.entries(files))
      parts.push(Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"; filename="${path.basename(file)}"\r\nContent-Type: image/png\r\n\r\n`),
        readFileSync(file), Buffer.from('\r\n')]));
    parts.push(Buffer.from(`--${b}--\r\n`));
    return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${b}` };
  };

  let res;
  if (images.length >= 2) {
    const media = images.map((f, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 ? { caption: payload.caption } : {}) }));
    const files = Object.fromEntries(images.map((f, i) => [`p${i}`, f]));
    const { body, type } = multipart({ chat_id: chan, media: JSON.stringify(media) }, files);
    res = await fetch(api('sendMediaGroup'), { method: 'POST', headers: { 'Content-Type': type }, body });
  } else if (images.length === 1) {
    const { body, type } = multipart({ chat_id: chan, caption: payload.caption }, { photo: images[0] });
    res = await fetch(api('sendPhoto'), { method: 'POST', headers: { 'Content-Type': type }, body });
  } else {
    res = await fetch(api('sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chan, text: payload.caption, link_preview_options: { is_disabled: true } }),
    });
  }
  const j = await res.json();
  if (!j.ok) throw new Error('telegram failed: ' + JSON.stringify(j).slice(0, 300));
  console.log(`telegram: posted ${kind} (${images.length} images)`);
  return 'ok';
}

// ─── X (OAuth 1.0a, no dependencies) ────────────────────────────────
function oauthHeader(method, url, extraParams = {}) {
  const k = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET };
  const t = { key: process.env.X_ACCESS_TOKEN, secret: process.env.X_ACCESS_SECRET };
  const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const oauth = {
    oauth_consumer_key: k.key,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: t.key,
    oauth_version: '1.0',
  };
  const all = { ...oauth, ...extraParams };
  const paramStr = Object.keys(all).sort().map(key => `${enc(key)}=${enc(all[key])}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  const signingKey = `${enc(k.secret)}&${enc(t.secret)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort().map(key => `${enc(key)}="${enc(oauth[key])}"`).join(', ');
}

async function postX() {
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) { console.log('x: secrets missing — skipped'); return 'skip'; }

  // 1. upload media (v1.1 endpoint, OAuth1 — body params NOT in signature for multipart)
  const mediaIds = [];
  for (const file of images.slice(0, 4)) {
    const b = crypto.randomUUID().replace(/-/g, '');
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="media"; filename="${path.basename(file)}"\r\nContent-Type: image/png\r\n\r\n`),
      readFileSync(file), Buffer.from(`\r\n--${b}--\r\n`)]);
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: oauthHeader('POST', url), 'Content-Type': `multipart/form-data; boundary=${b}` },
      body,
    });
    const j = await r.json();
    if (!j.media_id_string) throw new Error('x media upload failed: ' + JSON.stringify(j).slice(0, 300));
    mediaIds.push(j.media_id_string);
  }

  // 2. the tweet (v2). X captions cap at 280 chars — generate writes
  //    telegram-length captions, so trim to the first paragraphs + link.
  let text = payload.captionX || payload.caption;
  if (text.length > 278) text = text.slice(0, text.lastIndexOf('\n', 252)).trimEnd() + '\n\nlink in bio';

  const url = 'https://api.twitter.com/2/tweets';
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
  });
  const j = await r.json();
  if (!j.data?.id) throw new Error('x tweet failed: ' + JSON.stringify(j).slice(0, 300));
  console.log(`x: posted ${kind} — tweet ${j.data.id}`);
  return 'ok';
}

// ─── Instagram (Graph API — images by public URL only) ──────────────
// The workflow commits the morning's cards to the social-assets branch
// and passes IMAGE_BASE_URL (raw.githubusercontent). Text-only posts
// (picks) are skipped — Instagram requires media.
async function postInstagram() {
  const token = process.env.IG_ACCESS_TOKEN, uid = process.env.IG_USER_ID;
  if (!token || !uid) { console.log('instagram: secrets missing — skipped'); return 'skip'; }
  if (!images.length) { console.log('instagram: text-only post — skipped (IG needs media)'); return 'skip'; }
  const base = process.env.IMAGE_BASE_URL;
  if (!base) { console.log('instagram: IMAGE_BASE_URL missing — skipped'); return 'skip'; }

  const API = 'https://graph.instagram.com/v23.0';
  const call = async (p, params) => {
    const r = await fetch(`${API}/${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }),
    });
    const j = await r.json();
    if (!j.id) throw new Error(`ig ${p} failed: ${JSON.stringify(j).slice(0, 300)}`);
    return j.id;
  };

  // IG gets its native 4:5 set when the generator produced one
  const igFiles = (payload.imagesIG || []).map(n => path.join(OUT, n)).filter(existsSync);
  const chosen = igFiles.length ? igFiles : images;
  const urls = chosen.slice(0, 10).map(f => `${base}/${path.basename(f)}`);
  const igCaption = payload.caption.replace(/\n?oddyessa\.com\s*$/i, 'Full reasoning → oddyessa.com (link in bio)')
    + '\n\n' + (payload.hashtagsIG || '#WorldCup2026 #FootballPredictions #ReadTheGame');
  let containerId;
  if (urls.length === 1) {
    containerId = await call(`${uid}/media`, { image_url: urls[0], caption: igCaption });
  } else {
    const children = [];
    for (const u of urls) children.push(await call(`${uid}/media`, { image_url: u, is_carousel_item: 'true' }));
    containerId = await call(`${uid}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: igCaption });
  }
  for (let i = 0; i < 10; i++) {
    const s = await (await fetch(`${API}/${containerId}?fields=status_code&access_token=${token}`)).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('ig container processing failed');
    await new Promise(r => setTimeout(r, 3000));
  }
  const postId = await call(`${uid}/media_publish`, { creation_id: containerId });
  console.log(`instagram: posted ${kind} — ${postId} (${urls.length} images)`);
  return 'ok';
}

// ── record per-platform results into the next-state file ─────────────
// matchday.mjs created state.pending[id]; we update each platform's status
// and, once nothing is left owed (every platform ok or skip), promote the
// item into the done-list (state.prematch / state.receipts) and log it.
function recordResults(results) {
  if (!ITEM_ID) return; // ledger/picks runs carry no per-item state
  const SP = path.join(OUT, 'state-next.json');
  let st;
  try { st = JSON.parse(readFileSync(SP, 'utf8')); } catch { console.error('state-next.json unreadable — results not recorded'); return; }
  st.pending = st.pending || {};
  const entry = st.pending[ITEM_ID] || { kind, label: ITEM_ID, platforms: {} };
  entry.platforms = entry.platforms || {};
  for (const [k, v] of Object.entries(results)) entry.platforms[k] = v;
  st.pending[ITEM_ID] = entry;

  const remaining = ALL_PLATFORMS.filter(k => entry.platforms[k] === 'todo' || entry.platforms[k] === 'failed');
  const okCount = ALL_PLATFORMS.filter(k => entry.platforms[k] === 'ok').length;
  if (remaining.length === 0) {
    const list = kind === 'prematch' ? 'prematch' : 'receipts';
    st[list] = Array.isArray(st[list]) ? st[list] : [];
    if (!st[list].includes(ITEM_ID)) st[list].push(ITEM_ID);
    st.log = Array.isArray(st.log) ? st.log : [];
    st.log.push({ kind, id: ITEM_ID, label: entry.label, at: new Date().toISOString(), platforms: { ...entry.platforms } });
    delete st.pending[ITEM_ID];
    console.log(`${kind} ${ITEM_ID}: delivered on every platform (${okCount} posted) → marked done`);
  } else {
    console.log(`${kind} ${ITEM_ID}: still owed [${remaining.join(', ')}] → retries next tick`);
  }
  writeFileSync(SP, JSON.stringify(st, null, 2));
}

const results = {};
let failed = false;
for (const [name, fn] of [['telegram', postTelegram], ['x', postX], ['instagram', postInstagram]]) {
  if (!ONLY.includes(name)) continue; // not owed this tick — keep prior status
  try { results[name] = (await fn()) || 'ok'; }
  catch (e) { results[name] = 'failed'; failed = true; console.error(`${name}: ${e.message}`); }
}
recordResults(results);
// Matchday items (with a stamped id) record failures in state and retry
// next tick, so they must NOT abort the workflow before state is committed
// — exit 0. The daily ledger/picks runs have no stateful retry, so keep the
// red run there as the failure signal.
if (failed) console.error(`publish ${kind}: one or more platforms failed${ITEM_ID ? ' — recorded for retry' : ''}`);
process.exit(failed && !ITEM_ID ? 1 : 0);
