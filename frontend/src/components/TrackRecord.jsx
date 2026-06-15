import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, CircleDot, AlertCircle } from 'lucide-react';
import api from '../api/client.js';

// ─── SETTLED CALLS — THE RECEIPTS ───────────────────────────────────
// Every scored prediction, graded in public, newest first. Each row links
// to the full post-match analysis (the locked call vs the result). Renders
// nothing until the first match has been scored — no fake history.
//
// A prediction is NOT graded by the crude "did the favourite win" binary.
// The lean is judged by the probability we gave the result that actually
// happened: a 57% lean that draws (and we priced the draw ~24%) is INSIDE
// OUR RANGE, not a failure. Only a genuinely under-weighted result is red.

const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, ui-monospace)' };

const MODEL_LABELS = {
  'wc-elo-market-v1': 'World Cup',
  'intl-elo-market-v1': 'Friendlies',
};

// tone → colour. Steel/amber/gold are inline (no CSS var) so the grade
// reads the same on the CEO board and the social receipts.
const TONE = { green: 'var(--success)', steel: '#8A94A6', amber: '#D99A2B', red: 'var(--danger)', gold: '#C9A227' };

const TIER = {
  ON_READ: { label: 'CALLED', tone: 'green', Icon: CheckCircle2 },
  IN_RANGE: { label: 'IN RANGE', tone: 'steel', Icon: CircleDot },
  AGAINST: { label: 'AGAINST', tone: 'amber', Icon: AlertCircle },
  MISSED: { label: 'MISSED', tone: 'red', Icon: XCircle },
};

// Fallback mirror of backend/engine/grading.js outcome bands — used only
// when the API row hasn't shipped a `grade` yet. KEEP THESE IN SYNC.
function localGrade(r) {
  const norm = (v) => { const n = Number(v) || 0; return n > 1 ? n / 100 : n; };
  const p = { HOME: norm(r.prob_home), DRAW: norm(r.prob_draw), AWAY: norm(r.prob_away) };
  const actual = r.actual_outcome;
  if (!['HOME', 'DRAW', 'AWAY'].includes(actual)) return { tier: r.prediction_correct ? 'ON_READ' : 'MISSED', pActual: null };
  const top = p.HOME >= p.DRAW && p.HOME >= p.AWAY ? 'HOME' : p.DRAW >= p.AWAY ? 'DRAW' : 'AWAY';
  const pa = p[actual];
  const tier = actual === top ? 'ON_READ' : pa >= 0.22 ? 'IN_RANGE' : pa >= 0.13 ? 'AGAINST' : 'MISSED';
  return { tier, pActual: pa };
}

const gradeOf = (r) => r.grade?.outcome || localGrade(r);

function outcomeLabel(outcome, homeTeam, awayTeam) {
  if (outcome === 'HOME') return `${homeTeam} win`;
  if (outcome === 'AWAY') return `${awayTeam} win`;
  return 'Draw';
}

export default function TrackRecord({ onSelect }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/results/recent?limit=12')
      .then(res => { if (!cancelled) setRows(res?.data?.data || []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  if (!rows?.length) return null;

  const tally = rows.reduce((t, r) => { const k = gradeOf(r).tier; t[k] = (t[k] || 0) + 1; return t; }, {});
  const called = tally.ON_READ || 0;
  const inRange = tally.IN_RANGE || 0;
  const missed = tally.MISSED || 0;
  const avgBrier = rows.reduce((s, r) => s + Number(r.brier_score || 0), 0) / rows.length;

  return (
    <div className="card" style={{ padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          SETTLED CALLS — EVERY ONE, GRADED IN PUBLIC
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong style={{ ...mono, color: 'var(--success)' }}>{called}</strong> called
          {' · '}<strong style={{ ...mono, color: TONE.steel }}>{inRange}</strong> in range
          {' · '}<strong style={{ ...mono, color: missed ? 'var(--danger)' : 'var(--text-primary)' }}>{missed}</strong> missed
          {' · '}avg Brier <strong style={{ ...mono, color: 'var(--accent)' }}>{avgBrier.toFixed(3)}</strong>
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        Locked before kickoff, graded by the probability we gave the actual result. Tap a match for the full receipt.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => {
          const g = gradeOf(r);
          const t = TIER[g.tier] || TIER.MISSED;
          const tone = TONE[t.tone];
          const Icon = t.Icon;
          const exact = r.grade?.scoreline?.tier === 'EXACT';
          const ftH = r.ft_home_goals ?? r.home_goals;
          const ftA = r.ft_away_goals ?? r.away_goals;
          const pickProb = r.predicted_outcome === 'HOME' ? r.prob_home
            : r.predicted_outcome === 'DRAW' ? r.prob_draw : r.prob_away;
          const pActualPct = g.pActual != null ? Math.round(g.pActual * 100) : null;
          const modelLabel = MODEL_LABELS[r.model_version] || 'Club';
          return (
            <button
              key={r.match_external_id || i}
              onClick={() => onSelect?.({
                id: r.match_external_id,
                homeTeam: { name: r.home_team },
                awayTeam: { name: r.away_team },
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 4px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: 'transparent',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <Icon size={16} style={{ color: tone, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.home_team} <span style={mono}>{ftH ?? '–'}–{ftA ?? '–'}</span> {r.away_team}
                  </span>
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: tone, border: `1px solid ${tone}`, borderRadius: 4, padding: '1px 5px', flexShrink: 0, opacity: 0.92 }}>
                    {t.label}
                  </span>
                  {exact && (
                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: TONE.gold, border: `1px solid ${TONE.gold}`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                      EXACT
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  We said {outcomeLabel(r.predicted_outcome, r.home_team, r.away_team)}
                  {pickProb != null && <span style={mono}> {Math.round(pickProb)}%</span>}
                  {g.tier !== 'ON_READ' && pActualPct != null && (
                    <span> · {outcomeLabel(r.actual_outcome, r.home_team, r.away_team).toLowerCase()} was the <span style={mono}>{pActualPct}%</span> result</span>
                  )}
                  {' · '}{modelLabel}
                  {r.match_date && <> · {new Date(r.match_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</>}
                </div>
              </div>
              {r.brier_score != null && (
                <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: tone, flexShrink: 0 }}>
                  {Number(r.brier_score).toFixed(3)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
