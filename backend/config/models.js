// ─── CLAUDE MODEL IDS — SINGLE SOURCE OF TRUTH ───────────────────────
// Every Anthropic call in the backend imports its model id from here.
// Do NOT hardcode 'claude-*' strings anywhere else.
//
// Why this file exists: model ids were duplicated across routes/services.
// When 'claude-sonnet-4-20250514' was retired (2026-06-15) only some files
// had been migrated, so the un-migrated ones started returning a generic
// "can't process" error — an outage that was invisible until traced.
// One constant per role means one edit on the next migration.
// (Lesson logged in the vault Debugging Playbook 2026-06-21.)
//
// services/monitor.js CLAUDE_PRICING stays a separate id-keyed lookup table
// (it must keep retired ids to price historical logs) — not driven by this.

// AI chat, match verdict, briefing, model analyst, fixture verdict.
export const CHAT_MODEL = 'claude-sonnet-4-6';

// matchNarrative brand-voice polish. Opus for copy quality; env can override.
export const NARRATIVE_MODEL = process.env.NARRATIVE_MODEL || 'claude-opus-4-8';

export default { CHAT_MODEL, NARRATIVE_MODEL };
