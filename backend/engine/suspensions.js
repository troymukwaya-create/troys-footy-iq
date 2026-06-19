// ─── RED-CARD → SUSPENSION CARRY-FORWARD ────────────────────────────
// A player sent off in a team's previous match is suspended for the next one.
// The sharp market prices this instantly; our model previously only saw
// injuries (the API-Football injuries endpoint is unreliable for tournament
// suspensions and never carries a fresh red card or an accumulated-yellow ban).
// We read the red cards directly from the last match's event timeline
// (API-Football `fixtures/events`, already used by the post-match narrative).
//
// HONEST LIMIT: this catches DIRECT reds + SECOND-YELLOW dismissals — the
// high-confidence, definitely-out cases. It does NOT catch accumulated single
// yellows (2 across games = 1-game ban) — that data isn't in the event feed.
// A rescinded card or a ban already served before the next match is the rare
// false positive; we only ever look at the team's single most-recent match,
// which keeps the window to the immediate next fixture.
//
// Pure + dependency-free → fully unit-testable (no network in this module).

// A dismissal: a straight red, OR a second yellow (which sends the player off).
// API-Football `type:'Card'` with detail 'Red Card' | 'Second Yellow card'.
function isDismissal(ev) {
  if (!ev) return false;
  const type = String(ev.type || '').toLowerCase();
  const detail = String(ev.detail || '').toLowerCase();
  if (type !== 'card') return false;
  return /red/.test(detail) || /second yellow/.test(detail);
}

/**
 * Extract every dismissal from a match's event list.
 * @param {Array} events - API-Football fixtures/events response
 * @returns {Array<{playerId:number|null, name:string, teamId:number|null, teamName:string, minute:number|null, detail:string}>}
 */
export function extractRedCards(events = []) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (!isDismissal(ev)) continue;
    const name = ev.player?.name;
    if (!name) continue;
    out.push({
      playerId: ev.player?.id ?? null,
      name,
      teamId: ev.team?.id ?? null,
      teamName: ev.team?.name || '',
      minute: ev.time?.elapsed ?? null,
      detail: ev.detail || 'Red Card',
    });
  }
  return out;
}

/**
 * Suspended players (from red cards) for one team in its last match.
 * Match by team id when available, else by normalised name.
 * Returns availability-engine-shaped entries: `suspended:true` + a moderate
 * importance default (definitely out, true importance unknown in the hot path
 * — bounded by the availability floor downstream).
 * @returns {Array<{name:string, importance:number, suspended:true, minute:number|null}>}
 */
export function suspendedPlayersForTeam(events = [], { teamId = null, teamName = '' } = {}) {
  const reds = extractRedCards(events);
  const norm = (s) => String(s || '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '').trim();
  const wantId = teamId != null ? String(teamId).replace('apf_t_', '') : null;
  const wantName = norm(teamName);
  const seen = new Set();
  const out = [];
  for (const r of reds) {
    const matchById = wantId != null && r.teamId != null && String(r.teamId) === wantId;
    const matchByName = !!wantName && norm(r.teamName) === wantName;
    if (!(matchById || matchByName)) continue;
    const key = norm(r.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: r.name, importance: 0.6, suspended: true, minute: r.minute });
  }
  return out;
}

export default { extractRedCards, suspendedPlayersForTeam };
