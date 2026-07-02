// ─── MATCH NARRATIVE — "WHAT HAPPENED" ───────────────────────────────
// Turns a finished match's events into one or two sentences, in the
// Oddyessa voice, that explain HOW the game met or broke our forecast.
//
// Two layers:
//   1. buildStory()  — DETERMINISTIC. Reads the goal/red-card/penalty
//      timeline (API-Football events) against our locked call and finds
//      the decisive moment. Never invents a minute or a scorer. Always
//      returns a shippable sentence on its own.
//   2. polishStory() — OPTIONAL Claude polish that rewrites the same FACTS
//      in brand voice. Falls back to the deterministic line on any error,
//      so the pipeline never blocks on the model.
//
// Honesty rule (brand canon): a miss is owned, never spun. We forecast
// probabilities, not certainties — when a low-probability event lands, we
// say so plainly. Never the word "Brier" in this copy. No emojis, no hype.

import axios from 'axios';
import { logApiCost } from './monitor.js';
// Opus 4.8 is the current model; brand voice quality matters more than the
// few cents per finished match. The id (and its NARRATIVE_MODEL env override)
// lives in config/models.js so every feature shares one source of truth.
import { NARRATIVE_MODEL } from '../config/models.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const LATE_MIN = 85;            // a goal at/after this minute is "late"

// One polished line per finished match per process — the 90' score never
// changes, so we never pay for the same narrative twice while it's hot.
const polishCache = new Map();

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const pctTxt = (v) => `${Math.round(Number(v) || 0)}%`;
const outcomeOf = (h, a) => (h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW');

// ── normalise API-Football events into a clean goal/card timeline ────
function timeline(events, homeName, awayName) {
  const goals = [];
  const reds = [];
  for (const e of events || []) {
    const minute = (e?.time?.elapsed ?? 0) + (e?.time?.extra ?? 0);
    const teamName = e?.team?.name || null;
    const type = e?.type || '';
    const detail = e?.detail || '';
    // Penalty-SHOOTOUT kicks arrive as Goal events too (API-Football marks
    // them in `comments`) — they are not match goals and would poison the
    // comeback/late-goal story logic on knockout games.
    if (/penalty shootout/i.test(e?.comments || e?.comment || '')) continue;
    if (type === 'Goal' && detail !== 'Missed Penalty') {
      // An own goal counts for the OTHER team.
      const isOwn = /own goal/i.test(detail);
      const credited = isOwn
        ? (teamName === homeName ? awayName : homeName)
        : teamName;
      goals.push({ minute, team: credited, penalty: /penalty/i.test(detail), own: isOwn });
    } else if (type === 'Card' && (detail === 'Red Card' || /second yellow/i.test(detail))) {
      reds.push({ minute, team: teamName });
    }
  }
  goals.sort((a, b) => a.minute - b.minute);
  reds.sort((a, b) => a.minute - b.minute);
  return { goals, reds };
}

// Running score immediately BEFORE a given goal index.
function scoreBefore(goals, idx, homeName) {
  let h = 0, a = 0;
  for (let i = 0; i < idx; i++) {
    if (goals[i].team === homeName) h++; else a++;
  }
  return { h, a };
}

/**
 * Build the deterministic match story.
 * @returns {{kind, tag, minute, text}} always (text is always shippable).
 */
export function buildStory({ homeName, awayName, ft, predictedOutcome, predictedProb, outcomeCorrect, scoreline, events }) {
  const pickName = predictedOutcome === 'HOME' ? homeName : predictedOutcome === 'AWAY' ? awayName : 'a draw';
  const pct = pctTxt(predictedProb);
  const ftStr = `${ft.home}–${ft.away}`;
  const finalOutcome = outcomeOf(ft.home, ft.away);
  const exact = !!scoreline?.exact;

  const { goals, reds } = timeline(events, homeName, awayName);
  const hasEvents = goals.length > 0 || reds.length > 0;

  // ── 1. Decisive late goal — the result changed in the closing minutes ──
  if (goals.length) {
    const last = goals[goals.length - 1];
    if (last.minute >= LATE_MIN) {
      const before = scoreBefore(goals, goals.length - 1, homeName);
      const outcomeBefore = outcomeOf(before.h, before.a);
      if (outcomeBefore !== finalOutcome) {
        const leveller = finalOutcome === 'DRAW';
        const scorerSide = last.team;
        const min = ordinal(last.minute);
        const weWereRight = predictedOutcome === outcomeBefore; // right until the swing
        if (weWereRight) {
          const verb = leveller ? `${scorerSide} levelled it` : `${scorerSide} won it`;
          return {
            kind: leveller ? 'late_equaliser' : 'late_winner',
            tag: 'LATE TWIST',
            minute: last.minute,
            text: `We called ${pickName} (${pct}), and for most of the night that was the game — then ${verb} in the ${min} minute${last.penalty ? ' from the spot' : ''}. A goal that late is the kind of rare swing our numbers can flag as possible but never rule out. The read held; the bounce of the ball didn't. It stays on the receipt.`,
          };
        }
        // The late goal moved the result our way.
        return {
          kind: 'late_vindication',
          tag: 'LATE SWING',
          minute: last.minute,
          text: `We had ${pickName} (${pct}), and it took until the ${min} minute to land — ${scorerSide} settled it late. Football makes you wait; the call held.`,
        };
      }
    }
  }

  // ── 2. Red card that plausibly reshaped the game (and we missed) ──────
  if (reds.length && !outcomeCorrect) {
    const r = reds[0];
    if (r.minute <= 70) {
      const backed = (predictedOutcome === 'HOME' && r.team === homeName) || (predictedOutcome === 'AWAY' && r.team === awayName);
      return {
        kind: 'red_card',
        tag: 'RED CARD',
        minute: r.minute,
        text: `The game we modelled changed on a ${ordinal(r.minute)}-minute red card${backed ? ` — ${r.team}, the side we backed, down to ten` : ` for ${r.team}`}. Eleven-v-ten isn't the match our ${pct} call was priced on, and a sending-off is something no pre-match number can see coming. It finished ${ftStr}.`,
      };
    }
  }

  // ── 3. Comeback — a team trailed by 2+ and recovered (and we missed) ──
  if (goals.length >= 2 && !outcomeCorrect) {
    let h = 0, a = 0, maxHomeLead = 0, maxAwayLead = 0;
    for (const g of goals) {
      if (g.team === homeName) h++; else a++;
      maxHomeLead = Math.max(maxHomeLead, h - a);
      maxAwayLead = Math.max(maxAwayLead, a - h);
    }
    const homeClawedBack = maxAwayLead >= 2 && finalOutcome !== 'AWAY';
    const awayClawedBack = maxHomeLead >= 2 && finalOutcome !== 'HOME';
    if (homeClawedBack || awayClawedBack) {
      const team = homeClawedBack ? homeName : awayName;
      return {
        kind: 'comeback',
        tag: 'COMEBACK',
        minute: null,
        text: `We leaned ${pickName} (${pct}); ${team} went two goals down and dragged it back to ${ftStr}. The forecast was sound — the comeback was the story the numbers couldn't price. It stays on the receipt.`,
      };
    }
  }

  // ── 4. Clean hit ─────────────────────────────────────────────────────
  if (outcomeCorrect) {
    if (exact) {
      return {
        kind: 'exact_hit',
        tag: 'EXACT',
        minute: null,
        text: `We said ${pickName} (${pct}) and had ${scoreline.actual} as the most likely score before kickoff — and that's exactly how it finished. No drama, no asterisks.`,
      };
    }
    return {
      kind: 'clean_hit',
      tag: 'CALLED',
      minute: null,
      text: `We said ${pickName} (${pct}) and that's how it went — ${ftStr}. The kind of night the model is built for.`,
    };
  }

  // ── 5. Honest miss with no single decisive event ─────────────────────
  return {
    kind: hasEvents ? 'miss_generic' : 'miss_nodata',
    tag: 'MISSED',
    minute: null,
    text: `We leaned ${pickName} (${pct}); it finished ${ftStr}. No single moment broke this one — some matches just sit in the band where the favourite and the result part ways. We forecast the odds, not the certainties, and this one landed the other way. It stays on the receipt.`,
  };
}

const VOICE = `You write one or two sentences for Oddyessa, a football probability engine that publishes its predictions and then grades them in public.

Voice: a calm, sharp analyst talking to a smart friend. Plain words, no jargon, no hype, no emojis. You quantify uncertainty and own it — a forecast is a probability, never a promise. When the model was right, you say so without gloating. When it missed, you own it cleanly and explain what in the match broke the forecast, framed as the kind of low-probability event a model can flag but never rule out. Never spin a miss into a secret win. Never use the word "Brier". Never use exclamation marks. Recurring motif you may use sparingly: "It stays on the receipt."`;

/**
 * Polish the deterministic story into brand-voice prose with Claude.
 * Returns the polished text, or the deterministic fallback on any failure.
 * @param {object} story  result of buildStory()
 * @param {object} facts  { homeName, awayName, ft, pickName, pct, outcomeCorrect }
 */
export async function polishStory(story, facts, cacheKey) {
  if (process.env.NARRATIVE_POLISH === 'off' || !process.env.ANTHROPIC_API_KEY) return story.text;
  if (cacheKey && polishCache.has(cacheKey)) return polishCache.get(cacheKey);

  const prompt = `${VOICE}

The match: ${facts.homeName} ${facts.ft.home}–${facts.ft.away} ${facts.awayName}.
Our locked pre-kickoff call: ${facts.pickName} at ${facts.pct}. Result vs our call: ${facts.outcomeCorrect ? 'CORRECT' : 'MISSED'}.
What happened (the facts — do not change any minute, score, team, or who scored): ${story.text}

Rewrite this as one or two sentences in the voice above. Keep every fact exactly. Return ONLY the final sentence(s) — no preamble, no quotes, no labels.`;

  try {
    const r = await axios.post(ANTHROPIC_API_URL, {
      model: NARRATIVE_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 20000,
    });
    try { logApiCost(r.data?.usage, NARRATIVE_MODEL, 'match_narrative'); } catch { /* never block on accounting */ }
    const text = (r.data?.content?.[0]?.text || '').trim();
    const out = text.length >= 20 ? text : story.text;
    if (cacheKey) polishCache.set(cacheKey, out);
    return out;
  } catch (err) {
    console.error('[narrative] polish failed, using deterministic line:', err.message);
    return story.text;
  }
}

export default { buildStory, polishStory };
