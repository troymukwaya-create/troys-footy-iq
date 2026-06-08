// ─── PASSWORDLESS AUTH (magic link) ─────────────────────────────────
// Email → one-time login link → long-lived session token. No passwords.
// Sessions last 90 days so people stay signed in and jump back into their
// account without re-authenticating every visit.

import crypto from 'crypto';
import { query, safeQuery } from '../db/index.js';
import { sendEmail, emailEnabled } from './email.js';

const FRONTEND = (process.env.FRONTEND_URL || 'https://oddyessa.com').replace(/\/+$/, '');
const LOGIN_TTL_MIN = 30;
const SESSION_TTL_DAYS = 90;
const newToken = () => crypto.randomBytes(32).toString('hex');

export async function requestLoginLink(email) {
  const token = newToken();
  const expires = new Date(Date.now() + LOGIN_TTL_MIN * 60_000);
  await query(`INSERT INTO login_tokens (token, email, expires_at) VALUES ($1, $2, $3)`, [token, email, expires]);
  const link = `${FRONTEND}/auth?token=${token}`;
  if (emailEnabled()) {
    await sendEmail({
      to: email,
      subject: 'Your Oddyessa sign-in link',
      html: linkHtml(link),
      text: `Sign in to Oddyessa:\n${link}\n\nThis link expires in ${LOGIN_TTL_MIN} minutes. If you didn't request it, ignore this email.`,
    });
  }
  return { sent: emailEnabled() };
}

export async function verifyLoginToken(token) {
  // atomically consume the token (single use, unexpired)
  const r = await query(
    `UPDATE login_tokens SET used = true
       WHERE token = $1 AND used = false AND expires_at > NOW()
     RETURNING email`,
    [token]
  );
  return r.rows[0]?.email || null;
}

export async function findOrCreateUser(email) {
  const r = await query(
    `INSERT INTO users (email, last_login_at) VALUES ($1, NOW())
       ON CONFLICT (email) DO UPDATE SET last_login_at = NOW()
     RETURNING id, email`,
    [email]
  );
  return r.rows[0];
}

export async function createSession(userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [token, userId, expires]);
  return { token, expires };
}

export async function getUserBySession(token) {
  if (!token) return null;
  const r = await query(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return r.rows[0] || null;
}

export async function destroySession(token) {
  await safeQuery(`DELETE FROM sessions WHERE token = $1`, [token]);
}

// Express middleware — requires a valid Bearer session token.
export async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const user = await getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error('[auth] middleware error:', err.message);
    return res.status(500).json({ error: 'auth_error' });
  }
}

function linkHtml(link) {
  return `<div style="background:#0B0B0D;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:32px 24px;max-width:520px;margin:0 auto;border-radius:16px">
  <div style="font-size:20px;font-weight:800"><span style="color:#A8344A">Odd</span>yessa</div>
  <h1 style="font-size:22px;margin:20px 0 10px">Sign in to Oddyessa</h1>
  <p style="color:#c7c7cf;line-height:1.6;font-size:15px">Tap the button to jump into your account. It keeps you signed in, so you won't have to do this every time.</p>
  <a href="${link}" style="display:inline-block;margin-top:14px;background:#A8344A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:12px;font-weight:700">Sign me in →</a>
  <p style="color:#6b6b73;font-size:12px;margin-top:26px;line-height:1.5">This link expires in 30 minutes. If you didn't request it, just ignore this email.</p>
</div>`;
}
