// ─── ADMIN AUTH (shared) ────────────────────────────────────────────
// Single-CEO auth: a correct ADMIN_PASSWORD mints a random in-memory
// session token (cleared on restart). Shared by every admin route file so
// they all validate against the same session store.

import crypto from 'crypto';

const sessions = new Map();                    // token -> expiresAt (ms)
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days

export function mintToken() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

export function isValidToken(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

// Constant-time password comparison against ADMIN_PASSWORD.
export function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Express middleware — 401s any request without a valid bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !isValidToken(token)) {
    return res.status(401).json({ error: true, message: 'Unauthorized' });
  }
  next();
}

export default { mintToken, isValidToken, passwordMatches, requireAuth };
