// ─── DAILY SOCIAL PUBLISHER ─────────────────────────────────────────
// Posts what generate.mjs produced. Env-gated per platform: a platform
// without its secrets is skipped with a notice, never an error — so the
// pipeline ships before every account exists and lights up one by one.
//
//   node publish.mjs ledger|picks|match
//
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL
//          X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

import { readFileSync, existsSync } from 'fs';
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

// ─── Telegram ───────────────────────────────────────────────────────
async function postTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN, chan = process.env.TELEGRAM_CHANNEL;
  if (!token || !chan) { console.log('telegram: secrets missing — skipped'); return; }
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
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) { console.log('x: secrets missing — skipped'); return; }

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
}

// ─── Instagram (Graph API — images by public URL only) ──────────────
// The workflow commits the morning's cards to the social-assets branch
// and passes IMAGE_BASE_URL (raw.githubusercontent). Text-only posts
// (picks) are skipped — Instagram requires media.
async function postInstagram() {
  const token = process.env.IG_ACCESS_TOKEN, uid = process.env.IG_USER_ID;
  if (!token || !uid) { console.log('instagram: secrets missing — skipped'); return; }
  if (!images.length) { console.log('instagram: text-only post — skipped (IG needs media)'); return; }
  const base = process.env.IMAGE_BASE_URL;
  if (!base) { console.log('instagram: IMAGE_BASE_URL missing — skipped'); return; }

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
}

let failed = false;
for (const [name, fn] of [['telegram', postTelegram], ['x', postX], ['instagram', postInstagram]]) {
  try { await fn(); }
  catch (e) { failed = true; console.error(`${name}: ${e.message}`); }
}
process.exit(failed ? 1 : 0);
