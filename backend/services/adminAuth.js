// ─── ADMIN AUTH (shared) ────────────────────────────────────────────
// Single-CEO auth. A correct ADMIN_PASSWORD mints a STATELESS signed
// token: "<expiresAtMs>.<nonce>.<hmac>". There is no session store, so a
// token minted by one serverless instance verifies on every other one.
//
// Secret: ADMIN_TOKEN_SECRET, falling back to ADMIN_PASSWORD so the
// deployment needs no new secret to work.

import crypto from 'crypto';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days

function secret() {
  const s = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';
  if (!s) throw new Error('ADMIN_TOKEN_SECRET or ADMIN_PASSWORD must be set');
  return s;
}

function sign(expiresAt, nonce) {
  return crypto.createHmac('sha256', secret())
    .update(`${expiresAt}.${nonce}`)
    .digest('hex');
}

export function mintToken() {
  const expiresAt = Date.now() + SESSION_TTL;
  const nonce = crypto.randomBytes(16).toString('hex');
  return `${expiresAt}.${nonce}.${sign(expiresAt, nonce)}`;
}

export function isValidToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expPart, nonce, sig] = parts;
  const expiresAt = Number(expPart);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  let expected;
  try { expected = sign(expiresAt, nonce); } catch { return false; }

  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
