import React from 'react';
import { CheckCircle2, XCircle, Lock, Receipt } from 'lucide-react';

// ─── THE CALL — SETTLED ─────────────────────────────────────────────
// Post-match receipt: the locked pre-match call next to what actually
// happened. Hits and misses render with identical prominence — the
// credibility of every ✓ is paid for by showing every ✗.

const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, ui-monospace)' };

function HitChip({ hit, children }) {
  const color = hit ? 'var(--success)' : 'var(--danger)';
  const bg = hit ? 'var(--success-muted)' : 'var(--danger-muted)';
  const Icon = hit ? CheckCircle2 : XCircle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 700, color,
      padding: '4px 10px', borderRadius: 99, background: bg,
    }}>
      <Icon size={13} />
      {children}
    </span>
  );
}

export function MatchVerdict({ verdict, prob, home, away, homeColor, awayColor }) {
  if (!verdict) return null;

  const pickName = verdict.predictedOutcome === 'HOME' ? `${home} win`
    : verdict.predictedOutcome === 'AWAY' ? `${away} win` : 'Draw';
  const pickColor = verdict.predictedOutcome === 'HOME' ? homeColor
    : verdict.predictedOutcome === 'AWAY' ? awayColor : 'var(--text-secondary)';
  const actualName = verdict.actualOutcome === 'HOME' ? `${home} won`
    : verdict.actualOutcome === 'AWAY' ? `${away} won` : 'Draw';

  const sl = verdict.scoreline;
  const lockedTime = verdict.lockedAt
    ? new Date(verdict.lockedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const headline = verdict.outcomeCorrect
    ? (sl?.exact ? 'Called the winner and the exact score' : 'Called it')
    : 'Missed this one';

  return (
    <div className="card" style={{ padding: 18, border: `1px solid ${verdict.outcomeCorrect ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
      {/* Header — what this card is */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Receipt size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>THE CALL — SETTLED</span>
        </div>
        {lockedTime && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-muted)' }}>
            <Lock size={11} />
            Locked {lockedTime} UTC — before kickoff, on the record
          </span>
        )}
      </div>

      {/* Verdict headline */}
      <div style={{ fontSize: 17, fontWeight: 800, color: verdict.outcomeCorrect ? 'var(--success)' : 'var(--danger)', marginBottom: 14 }}>
        {headline}
      </div>

      {/* Said vs happened */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>WE SAID</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: pickColor }}>
            {pickName} <span style={{ ...mono, color: 'var(--text-primary)' }}>{Math.round(verdict.predictedProb)}%</span>
          </div>
          {sl?.predicted && (
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Most likely score <strong style={{ ...mono, color: 'var(--text-primary)' }}>{sl.predicted}</strong> ({sl.predictedProb}%)
            </div>
          )}
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>WHAT HAPPENED</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
            {actualName} <span style={mono}>{sl?.actual || ''}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Full-time, 90 minutes</div>
        </div>
      </div>

      {/* Every call, settled */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <HitChip hit={verdict.outcomeCorrect}>Winner — {pickName}</HitChip>
        {sl && (
          <HitChip hit={!!sl.exact}>
            {sl.exact ? `Exact score — ${sl.predicted}`
              : sl.rankInTop ? `Score ${sl.actual} was our #${sl.rankInTop} scoreline`
              : `Score — said ${sl.predicted}, got ${sl.actual}`}
          </HitChip>
        )}
        {(verdict.marketCalls || []).map((c, i) => (
          <HitChip key={i} hit={c.hit}>{c.label} ({Math.round(c.prob)}%)</HitChip>
        ))}
      </div>

      {/* Brier — the score we keep on ourselves */}
      {verdict.brier != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-muted)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>This match's Brier</span>
          <span style={{ ...mono, fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{Number(verdict.brier).toFixed(3)}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            (0 = perfect, 0.25 ≈ coin flip) · {verdict.inLedger ? 'counted in our public track record' : 'entering the public ledger shortly'}
          </span>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 12 }}>
        This is the prediction exactly as it was locked before kickoff — nothing here was edited after the final whistle. Misses stay on the record too.
      </div>
    </div>
  );
}

export default MatchVerdict;
