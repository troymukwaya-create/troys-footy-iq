// ─── EMAIL CAPTURE / CRM ────────────────────────────────────────────
// POST /api/subscribe            → add an email to the owned list
// GET  /api/subscribe/unsubscribe?token=… → one-click opt-out
//
// Open by design: we capture emails through value (daily picks), never a
// wall. Each subscriber is stitched to their anonymous visitor_id so the
// CRM has behaviour + email. Storage is ours (Postgres); sending is Resend.

import { Router } from 'express';
import crypto from 'crypto';
import { query, safeQuery, isDbAvailable } from '../db/index.js';
import { sendEmail, emailEnabled } from '../services/email.js';

const router = Router();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PUBLIC_API = (process.env.PUBLIC_API_URL || 'https://troys-footy-iq-api.onrender.com').replace(/\/+$/, '');

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'invalid_email' });
    if (!isDbAvailable()) return res.status(503).json({ error: 'unavailable' });

    const source = String(b.source || 'site').slice(0, 40);
    const visitorId = b.visitorId ? String(b.visitorId).slice(0, 40) : null;
    const prefs = b.prefs && typeof b.prefs === 'object' ? JSON.stringify(b.prefs) : JSON.stringify({ worldCup: true });
    const token = crypto.randomBytes(24).toString('hex');

    const result = await query(
      `INSERT INTO subscribers (email, source, visitor_id, prefs, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         status = 'active',
         visitor_id = COALESCE(subscribers.visitor_id, EXCLUDED.visitor_id),
         updated_at = NOW()
       RETURNING (xmax = 0) AS is_new, unsubscribe_token`,
      [email, source, visitorId, prefs, token]
    );
    const row = result.rows[0] || {};
    const isNew = !!row.is_new;

    if (isNew && emailEnabled()) {
      const unsub = `${PUBLIC_API}/api/subscribe/unsubscribe?token=${row.unsubscribe_token}`;
      // best-effort: never block the response on the email send
      sendEmail({
        to: email,
        subject: 'You’re in — Oddyessa’s best bets, every morning ⚽',
        html: welcomeHtml(unsub),
        text: welcomeText(unsub),
        headers: { 'List-Unsubscribe': `<${unsub}>` },
      }).catch(() => {});
    }

    return res.json({ ok: true, isNew, emailQueued: isNew && emailEnabled() });
  } catch (err) {
    console.error('[subscribe] error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.get('/unsubscribe', async (req, res) => {
  const token = String(req.query.token || '');
  if (token) {
    await safeQuery(`UPDATE subscribers SET status='unsubscribed', updated_at=NOW() WHERE unsubscribe_token = $1`, [token]);
  }
  res.set('Content-Type', 'text/html').send(unsubPage());
});

// ─── Email templates ────────────────────────────────────────────────
function welcomeHtml(unsub) {
  return `<div style="background:#0B0B0D;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:32px 24px;max-width:520px;margin:0 auto;border-radius:16px">
  <div style="font-size:20px;font-weight:800"><span style="color:#A8344A">Odd</span>yessa</div>
  <h1 style="font-size:24px;margin:20px 0 10px">You’re in. ⚽</h1>
  <p style="color:#c7c7cf;line-height:1.6;font-size:15px">From now on you’ll get our <b>best bets and value picks</b> — who we fancy, why, and where the bookies have it wrong — straight to your inbox each morning of the World Cup.</p>
  <p style="color:#c7c7cf;line-height:1.6;font-size:15px">No hype. We even publish how often we’re right.</p>
  <a href="https://oddyessa.com" style="display:inline-block;margin-top:14px;background:#A8344A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">Read the game →</a>
  <p style="color:#6b6b73;font-size:12px;margin-top:28px;line-height:1.5">You’re getting this because you signed up at oddyessa.com. Data only — not betting advice. 18+, please play responsibly.<br><a href="${unsub}" style="color:#9a9aa2">Unsubscribe</a></p>
</div>`;
}
function welcomeText(unsub) {
  return `You're in — Oddyessa.

From now on you'll get our best bets and value picks — who we fancy, why, and where the bookies have it wrong — each morning of the World Cup. No hype; we publish how often we're right.

Read the game: https://oddyessa.com

Data only, not betting advice. 18+. Unsubscribe: ${unsub}`;
}
function unsubPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed · Oddyessa</title></head>
<body style="background:#0B0B0D;color:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div><div style="font-size:22px;font-weight:800"><span style="color:#A8344A">Odd</span>yessa</div>
  <h1 style="font-size:22px;margin:18px 0 8px">You’re unsubscribed.</h1>
  <p style="color:#9a9aa2;font-size:14px">You won’t get any more emails from us. No hard feelings — <a href="https://oddyessa.com" style="color:#A8344A">come back anytime</a>.</p></div>
</body></html>`;
}

export default router;
