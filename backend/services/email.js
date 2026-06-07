// ─── EMAIL (Resend) ─────────────────────────────────────────────────
// Thin wrapper around the Resend HTTP API. No-ops gracefully when
// RESEND_API_KEY is not set yet, so the subscribe flow still captures
// emails before the key is in Render — they just don't get a send.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Oddyessa <picks@send.oddyessa.com>';

export function emailEnabled() {
  return !!RESEND_API_KEY;
}

export async function sendEmail({ to, subject, html, text, headers }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — captured but not sending to', to);
    return { skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, text, headers }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] send failed', res.status, body.slice(0, 300));
      return { error: true, status: res.status };
    }
    return await res.json();
  } catch (err) {
    console.error('[email] send threw:', err.message);
    return { error: true };
  }
}
