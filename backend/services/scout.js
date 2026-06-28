// ─── SCOUT (market-blind λ nudge, REASON/shadow) ────────────────────────────
// A Claude "tactical scout" that proposes a SMALL, BOUNDED adjustment to each
// side's expected goals (λ), based only on the matchup — never the betting line.
// This is the market-echo guard made concrete: if the scout could see the market
// it would just parrot it, and the shadow track would prove nothing. So the
// prompt is market-blind by construction AND re-checked by a regex before any
// API call; the nudge is clamped to ±15% so it can never override Elo/form.
//
// Shadow-only, gated on SCOUT_SHADOW. Degrades to null on any error (no key,
// timeout, bad JSON) — a missing nudge simply drops the wc-scout-shadow track.

import axios from 'axios';
import { logApiCost } from './monitor.js';
import { CHAT_MODEL } from '../config/models.js';
import { fanbrainFlags } from '../config/fanbrainFlags.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const NUDGE_LO = 0.85, NUDGE_HI = 1.15; // ±15% cap — the Elo/form backbone stays dominant

/** Clamp any proposed multiplier into the bounded range; 1.0 (no change) on garbage. */
export function boundedNudge(x) {
  if (x == null) return 1;           // missing proposal ⇒ no change (Number(null)===0)
  const n = Number(x);
  if (!Number.isFinite(n)) return 1;
  return Math.max(NUDGE_LO, Math.min(NUDGE_HI, n));
}

/** Build the scout prompt. MARKET-BLIND by construction — no odds/probs/line. */
export function buildScoutPrompt(homeName, awayName, ctx = {}) {
  return [
    `Two national teams meet at the 2026 World Cup.`,
    `HOME: ${homeName}`,
    `AWAY: ${awayName}`,
    ctx.knockout ? `Stage: KNOCKOUT (must produce a winner).` : `Stage: group.`,
    ctx.venueCity ? `Venue: ${ctx.venueCity}.` : null,
    (ctx.homeRestDays != null || ctx.awayRestDays != null)
      ? `Rest days — home ${ctx.homeRestDays ?? '?'}, away ${ctx.awayRestDays ?? '?'}.` : null,
    ctx.homeForm?.form ? `Home recent form: ${ctx.homeForm.form}.` : null,
    ctx.awayForm?.form ? `Away recent form: ${ctx.awayForm.form}.` : null,
    ``,
    `You are a tactical scout. Use ONLY the matchup facts above — you have no outside`,
    `ratings or numbers from anyone else, and must not invent any. From tactical fit,`,
    `fitness and motivation, estimate a SMALL multiplier on each side's expected goals.`,
    `Return ONLY JSON, no prose:`,
    `{"home": <0.85-1.15>, "away": <0.85-1.15>, "why": "<max 8 words>"}`,
    `1.0 = no change. Most games sit near 1.0 — be conservative.`,
  ].filter(Boolean).join('\n');
}

// If any of these appear in the prompt, a market signal leaked — refuse to call.
const MARKET_LEAK = /\bodd|implied|market|\bprice|bookmak|\bline\b|prob_home|prob_draw|prob_away/i;
export function assertMarketBlind(prompt) { return !MARKET_LEAK.test(String(prompt)); }

/** Parse Claude's reply into a bounded { home, away, why } nudge, or null. */
export function parseScoutResponse(text) {
  try {
    const clean = String(text).replace(/^\s*```[a-z]*\n?/im, '').replace(/\n?```\s*$/im, '');
    const j = JSON.parse(clean);
    if (j == null || (j.home == null && j.away == null)) return null;
    return { home: boundedNudge(j.home), away: boundedNudge(j.away), why: String(j.why || '').slice(0, 80) };
  } catch { return null; }
}

/** Market-blind λ nudge for one match (shadow). Returns {home,away,why} or null. */
export async function scoutLambdaNudge(homeName, awayName, ctx = {}) {
  if (!fanbrainFlags.scout() || !process.env.ANTHROPIC_API_KEY) return null;
  const prompt = buildScoutPrompt(homeName, awayName, ctx);
  if (!assertMarketBlind(prompt)) {
    console.error('[scout] market term leaked into prompt — refusing call');
    return null;
  }
  try {
    const res = await axios.post(ANTHROPIC_API_URL, {
      model: CHAT_MODEL, max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 15000,
    });
    try { logApiCost(res.data?.usage, CHAT_MODEL, 'scout_shadow'); } catch { /* accounting never breaks scout */ }
    return parseScoutResponse(res.data?.content?.[0]?.text || '');
  } catch (e) {
    console.error('[scout] nudge failed (shadow, ignored):', e.message);
    return null;
  }
}

export default { scoutLambdaNudge, buildScoutPrompt, parseScoutResponse, boundedNudge, assertMarketBlind };
