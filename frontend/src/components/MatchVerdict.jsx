import React from 'react';
import { CheckCircle2, XCircle, CircleDot, AlertCircle, Lock, Receipt } from 'lucide-react';
import { VersusHero, T } from './fixture/primitives.jsx';

const parseScoreStr = (s) => { const m = /^(\d+)\s*[-–:]\s*(\d+)$/.exec(String(s || '').trim()); return m ? { home: +m[1], away: +m[2] } : null; };

// ─── THE CALL — SETTLED ─────────────────────────────────────────────
// Post-match receipt: the locked pre-match call next to what actually
// happened. The lean is graded by the probability we gave the result that
// actually happened — a 57% lean that draws (and we priced the draw ~24%)
// is INSIDE OUR RANGE, not a miss. Only a genuinely under-weighted result
// is red, and that scarcity is what makes the red honest.

const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, ui-monospace)' };

const TONE = { green: 'var(--success)', steel: '#8A94A6', amber: '#D99A2B', red: 'var(--danger)', gold: '#C9A227' };
const TONE_BG = {
  green: 'var(--success-muted)', steel: 'rgba(138,148,166,0.12)', amber: 'rgba(217,154,43,0.12)',
  red: 'var(--danger-muted)', gold: 'rgba(201,162,39,0.12)',
};
const TONE_BORDER = {
  green: 'rgba(34,197,94,0.28)', steel: 'rgba(138,148,166,0.30)', amber: 'rgba(217,154,43,0.30)',
  red: 'rgba(239,68,68,0.28)', gold: 'rgba(201,162,39,0.30)',
};
const TIER = {
  ON_READ: { label: 'CALLED', tone: 'green', Icon: CheckCircle2, headline: 'Called it' },
  IN_RANGE: { label: 'IN RANGE', tone: 'steel', Icon: CircleDot, headline: 'Inside our range' },
  AGAINST: { label: 'AGAINST THE READ', tone: 'amber', Icon: AlertCircle, headline: 'Against the read' },
  MISSED: { label: 'MISSED', tone: 'red', Icon: XCircle, headline: 'A genuine miss' },
};

// Fallback mirror of backend/engine/grading.js — used only if the verdict
// hasn't shipped a graded outcome yet. KEEP THRESHOLDS IN SYNC.
function localGrade(probObj, actual) {
  const norm = (v) => { const n = Number(v) || 0; return n > 1 ? n / 100 : n; };
  const p = { HOME: norm(probObj?.home), DRAW: norm(probObj?.draw), AWAY: norm(probObj?.away) };
  if (!['HOME', 'DRAW', 'AWAY'].includes(actual)) return { tier: 'IN_RANGE', pActual: null };
  const top = p.HOME >= p.DRAW && p.HOME >= p.AWAY ? 'HOME' : p.DRAW >= p.AWAY ? 'DRAW' : 'AWAY';
  const pa = p[actual];
  const tier = actual === top ? 'ON_READ' : pa >= 0.22 ? 'IN_RANGE' : pa >= 0.13 ? 'AGAINST' : 'MISSED';
  return { tier, pActual: pa };
}

function GradeChip({ tone, Icon, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 700, color: TONE[tone],
      padding: '4px 10px', borderRadius: 99, background: TONE_BG[tone],
    }}>
      {Icon && <Icon size={13} />}
      {children}
    </span>
  );
}

const TONE_ICON = { green: CheckCircle2, gold: CheckCircle2, red: XCircle, steel: CircleDot, amber: AlertCircle };
function HitChip({ hit, tone, children }) {
  const t = tone || (hit ? 'green' : 'red');
  return <GradeChip tone={t} Icon={TONE_ICON[t] || (hit ? CheckCircle2 : XCircle)}>{children}</GradeChip>;
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

  // Graded outcome (backend) with a local fallback so the receipt is honest
  // even before the API redeploys.
  const og = verdict.outcomeGrade || localGrade(prob?.probabilities, verdict.actualOutcome);
  const t = TIER[og?.tier] || (verdict.outcomeCorrect ? TIER.ON_READ : TIER.MISSED);
  const tone = t.tone;
  const tColor = TONE[tone];
  const pActualPct = og?.pActual != null ? Math.round(og.pActual * 100) : null;
  const blurb = verdict.gradeBlurb
    || (og?.tier && og.tier !== 'ON_READ' && pActualPct != null
      ? `Our lean missed, but ${actualName.replace(' won', '').toLowerCase().includes('draw') ? 'the draw' : actualName.toLowerCase()} was the ${pActualPct}% result — ${og.tier === 'MISSED' ? 'a genuine miss.' : 'inside the range we priced.'}`
      : null);
  const headline = verdict.assessment?.headline || t.headline;

  // Knockout decider (AET/pens) — DISPLAY ONLY. The grade above is the
  // 90-minute result (1X2 market convention); this just tells the reader who
  // actually went through so the receipt never looks blind to what they watched.
  const decided = verdict.decided || null;
  const deciderText = decided?.advanced
    ? (decided.by === 'PEN'
        ? `${decided.advanced} went through${decided.penalty?.home != null ? ` ${decided.penalty.home}–${decided.penalty.away}` : ''} on penalties`
        : `${decided.advanced} won it ${decided.finalScore?.home}–${decided.finalScore?.away} in extra time`)
    : null;

  // Settled seam banner — the matchup motif with the final score on the fold.
  const hv = {
    home, away, league: '', stage: '', state: 'settled',
    score: parseScoreStr(sl?.actual), prob: null, kickoff: '',
  };

  return (
    <div className="card" style={{ padding: 0, border: `1px solid ${TONE_BORDER[tone]}`, overflow: 'hidden', isolation: 'isolate' }}>
      <VersusHero v={hv} t={{ accent: T.accent, colorMode: 'nation', density: 5, flagBg: false }}
        h={120} meta codes codeSize={18} disc={20} seam={[60, 40]} discTop={48} />
      <div style={{ padding: 18 }}>
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
      <div style={{ fontSize: 17, fontWeight: 800, color: tColor, marginBottom: blurb ? 6 : 14 }}>
        {headline}
      </div>
      {blurb && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          {blurb}
        </div>
      )}

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
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>{decided ? 'After 90 minutes' : 'Full-time, 90 minutes'}</div>
          {deciderText && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: TONE.gold, marginTop: 5 }}>
              {deciderText}
            </div>
          )}
        </div>
      </div>

      {/* Every call, settled */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <GradeChip tone={tone} Icon={t.Icon}>
          {t.label} — {pickName}{pActualPct != null && og?.tier !== 'ON_READ' ? ` · ${pActualPct}% result` : ''}
        </GradeChip>
        {sl && (
          <HitChip hit={!!sl.exact} tone={sl.exact ? 'gold' : 'steel'}>
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
    </div>
  );
}

export default MatchVerdict;
