// ─── AUTH ROUTES (passwordless) ─────────────────────────────────────
// POST /api/auth/request  {email}  → email a magic sign-in link
// POST /api/auth/verify   {token}  → exchange link token for a session
// GET  /api/auth/me                → current user (Bearer session)
// POST /api/auth/logout            → end the session

import { Router } from 'express';
import { isDbAvailable } from '../db/index.js';
import {
  requestLoginLink, verifyLoginToken, findOrCreateUser,
  createSession, destroySession, requireAuth,
} from '../services/auth.js';

const router = Router();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

router.post('/request', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'invalid_email' });
    if (!isDbAvailable()) return res.status(503).json({ error: 'unavailable' });
    const r = await requestLoginLink(email);
    // Never reveal whether the account exists; never expose the link.
    return res.json({ ok: true, emailSending: r.sent });
  } catch (e) {
    console.error('[auth/request]', e.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ error: 'missing_token' });
    if (!isDbAvailable()) return res.status(503).json({ error: 'unavailable' });
    const email = await verifyLoginToken(token);
    if (!email) return res.status(400).json({ error: 'invalid_or_expired' });
    const user = await findOrCreateUser(email);
    const session = await createSession(user.id);
    return res.json({ token: session.token, user: { email: user.email } });
  } catch (e) {
    console.error('[auth/verify]', e.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Sign in with Google — verifies the GIS ID token, then issues our session.
router.post('/google', async (req, res) => {
  try {
    const credential = String(req.body?.credential || '');
    if (!credential) return res.status(400).json({ error: 'missing_credential' });
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!CLIENT_ID) return res.status(503).json({ error: 'google_not_configured' });
    if (!isDbAvailable()) return res.status(503).json({ error: 'unavailable' });

    // Google validates signature + expiry server-side and returns the claims.
    const tk = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!tk.ok) return res.status(401).json({ error: 'invalid_token' });
    const p = await tk.json();
    if (p.aud !== CLIENT_ID) return res.status(401).json({ error: 'aud_mismatch' });          // token must be for OUR app
    if (p.email_verified !== 'true' && p.email_verified !== true) return res.status(401).json({ error: 'email_unverified' });
    const email = String(p.email || '').trim().toLowerCase();
    if (!email) return res.status(401).json({ error: 'no_email' });

    const user = await findOrCreateUser(email);
    const session = await createSession(user.id);
    return res.json({ token: session.token, user: { email: user.email } });
  } catch (e) {
    console.error('[auth/google]', e.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: { email: req.user.email } }));

router.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req.sessionToken);
  res.json({ ok: true });
});

export default router;
