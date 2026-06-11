import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import api from '../api/client.js';

// ─── SETTLED CALLS — THE RECEIPTS ───────────────────────────────────
// Every scored prediction, hit or miss, newest first. Each row links to
// the full post-match analysis (the locked call vs the result). Renders
// nothing until the first match has been scored — no fake history.

const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, ui-monospace)' };

const MODEL_LABELS = {
  'wc-elo-market-v1': 'World Cup',
  'intl-elo-market-v1': 'Friendlies',
};

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

  const correct = rows.filter(r => r.prediction_correct).length;
  const avgBrier = rows.reduce((s, r) => s + Number(r.brier_score || 0), 0) / rows.length;

  return (
    <div className="card" style={{ padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          SETTLED CALLS — EVERY ONE, HIT OR MISS
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Winners called <strong style={{ ...mono, color: 'var(--text-primary)' }}>{correct}/{rows.length}</strong>
          {' · '}avg Brier <strong style={{ ...mono, color: 'var(--accent)' }}>{avgBrier.toFixed(3)}</strong>
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        Locked before kickoff, scored after the whistle. Tap a match for the full receipt.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => {
          const hit = !!r.prediction_correct;
          const ftH = r.ft_home_goals ?? r.home_goals;
          const ftA = r.ft_away_goals ?? r.away_goals;
          const pickProb = r.predicted_outcome === 'HOME' ? r.prob_home
            : r.predicted_outcome === 'DRAW' ? r.prob_draw : r.prob_away;
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
              {hit
                ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                : <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.home_team} <span style={mono}>{ftH ?? '–'}–{ftA ?? '–'}</span> {r.away_team}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  We said {outcomeLabel(r.predicted_outcome, r.home_team, r.away_team)}
                  {pickProb != null && <span style={mono}> {Math.round(pickProb)}%</span>}
                  {' · '}{modelLabel}
                  {r.match_date && <> · {new Date(r.match_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</>}
                </div>
              </div>
              {r.brier_score != null && (
                <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: hit ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
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
