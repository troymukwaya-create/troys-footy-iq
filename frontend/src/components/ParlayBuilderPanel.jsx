import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Plus, Minus, TrendingUp, TrendingDown,
  AlertTriangle, ListChecks, Sparkles, Info,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { enterStagger, snap } from '../lib/motion.js';

// ─── EDGE THRESHOLDS ────────────────────────────────────────────────
// 3% edge ≈ within calibration noise. 7%+ is a meaningful signal.
const EDGE = {
  STRONG_POSITIVE:  0.03,   // > +3% → green
  WEAK:             -0.03,  // -3% to +3% → amber
  // anything below WEAK → red
};

function classifyEdge(edge) {
  if (edge == null || isNaN(edge)) return 'unknown';
  if (edge >= EDGE.STRONG_POSITIVE) return 'positive';
  if (edge >= EDGE.WEAK)            return 'neutral';
  return 'negative';
}

// ─── PROBABILITY DERIVATION (graceful) ──────────────────────────────
// Selection schema: { matchId, marketType, outcome, odds, ... }
// If selection has `modelProbability` set, use it. Otherwise, try the
// analyses cache for 1X2 markets. Returns probability in [0, 1] or null.
function deriveModelProbability(selection, analyses) {
  if (selection.modelProbability != null) return Number(selection.modelProbability);
  const analysis = analyses?.[selection.matchId];
  if (!analysis) return null;
  const probs = analysis?.probability?.probabilities;
  if (!probs) return null;
  const outcome = (selection.outcome || '').toLowerCase();
  const isMatchWinner = (selection.marketType || '').toLowerCase().includes('match')
    || (selection.marketType || '').toLowerCase().includes('1x2');
  if (!isMatchWinner) return null;
  if (outcome.includes('draw'))    return (probs.draw ?? 0) / 100;
  if (outcome.includes('away'))    return (probs.away ?? 0) / 100;
  if (outcome.includes('home'))    return (probs.home ?? 0) / 100;
  return null;
}

// ─── COMPONENT ──────────────────────────────────────────────────────
export function ParlayBuilderPanel() {
  const {
    parlaySelections,
    removeParlaySelection,
    clearParlay,
    analyses,
  } = useStore();

  const [stake, setStake] = useState(10);

  // Compute per-leg derived metrics
  const legs = useMemo(() => parlaySelections.map(sel => {
    const odds = parseFloat(sel.odds) || 1;
    const marketImplied = 1 / odds;                          // strict 1/odds; overround per-leg is small
    const modelProb     = deriveModelProbability(sel, analyses);
    const edge          = (modelProb != null) ? modelProb - marketImplied : null;
    return { ...sel, odds, marketImplied, modelProb, edge, edgeClass: classifyEdge(edge) };
  }), [parlaySelections, analyses]);

  // Joint calculations (assume independence)
  const totals = useMemo(() => {
    if (legs.length === 0) return null;
    let combinedOdds = 1;
    let marketJoint = 1;
    let modelJoint = 1;
    let modelCoverage = 0; // how many legs had model data
    for (const l of legs) {
      combinedOdds *= l.odds;
      marketJoint *= l.marketImplied;
      if (l.modelProb != null) {
        modelJoint *= l.modelProb;
        modelCoverage++;
      }
    }
    const hasFullModel = modelCoverage === legs.length;
    const expectedValue = hasFullModel ? (modelJoint * combinedOdds) - 1 : null;  // EV per $1 stake
    return {
      combinedOdds,
      marketImpliedPct: marketJoint * 100,
      modelImpliedPct:  hasFullModel ? modelJoint * 100 : null,
      expectedValuePct: expectedValue != null ? expectedValue * 100 : null,
      hasFullModel,
      modelCoverage,
      expectedReturn:   stake * combinedOdds,
      expectedProfit:   expectedValue != null ? stake * expectedValue : null,
    };
  }, [legs, stake]);

  // ─── Empty state ───
  if (legs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="sticky top-20 rounded-2xl border border-outline-variant/30 bg-surface-container/60 overflow-hidden"
      >
        <header className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Parlay</span>
          </div>
        </header>
        <div className="px-6 py-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-container-high mb-3">
            <ListChecks size={20} className="text-on-surface-variant" />
          </div>
          <div className="text-sm font-semibold text-on-surface mb-1">No selections yet</div>
          <div className="text-xs text-on-surface-variant leading-relaxed max-w-[220px] mx-auto">
            Tap odds in a match's Markets tab to build a parlay.
            We'll show your model's edge vs the bookmaker.
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── Active state ───
  const overallEdgeClass = totals.expectedValuePct == null
    ? 'unknown'
    : totals.expectedValuePct > 0 ? 'positive' : totals.expectedValuePct > -2 ? 'neutral' : 'negative';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="sticky top-20 rounded-2xl border border-outline-variant/30 bg-surface-container/60 overflow-hidden shadow-lg shadow-black/20"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-outline-variant/20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Parlay</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon/15 text-neon text-[11px] font-bold">
            {legs.length}
          </span>
        </div>
        <button
          onClick={clearParlay}
          className="text-[11px] font-medium text-on-surface-variant hover:text-error transition-colors"
        >
          Clear all
        </button>
      </header>

      {/* Legs */}
      <ul className="divide-y divide-outline-variant/15">
        <AnimatePresence initial={false}>
          {legs.map((leg, idx) => (
            <motion.li
              key={leg.matchId}
              {...enterStagger(idx)}
              exit={{ opacity: 0, x: 12, transition: snap }}
              layout
              className="px-4 py-3 hover:bg-surface-container-high/40 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-on-surface-variant truncate">{leg.matchLabel}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/70 px-1.5 py-0.5 rounded bg-surface-container-high">
                      {leg.marketType}
                    </span>
                    <span className="text-sm font-semibold text-on-surface">{leg.outcome}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-base font-bold text-on-surface tabular-nums">
                    {leg.odds.toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeParlaySelection(leg.matchId)}
                    className="w-6 h-6 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:bg-error/15 hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Remove selection"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Model vs Market */}
              <EdgeRow leg={leg} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* Summary */}
      <div className="px-4 py-4 bg-surface-container-low border-t border-outline-variant/20">
        {/* Joint probability summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <SummaryStat label="Combined" value={`${totals.combinedOdds.toFixed(2)}×`} sub="odds" />
          <SummaryStat label="Model" value={totals.modelImpliedPct != null
            ? `${totals.modelImpliedPct.toFixed(1)}%` : '—'}
            sub="joint prob" />
          <SummaryStat label="Market" value={`${totals.marketImpliedPct.toFixed(1)}%`} sub="implied" />
        </div>

        {/* EV callout — the headline */}
        {totals.expectedValuePct != null ? (
          <div className={`rounded-xl p-3 border ${
            overallEdgeClass === 'positive'
              ? 'bg-secondary-container/30 border-secondary/40'
              : overallEdgeClass === 'neutral'
                ? 'bg-tertiary-container/20 border-tertiary/30'
                : 'bg-error-container/20 border-error/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {overallEdgeClass === 'positive'
                  ? <TrendingUp size={16} className="text-secondary" />
                  : overallEdgeClass === 'negative'
                    ? <TrendingDown size={16} className="text-error" />
                    : <Info size={16} className="text-tertiary" />}
                <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Expected value
                </span>
              </div>
              <span className={`text-lg font-bold tabular-nums ${
                overallEdgeClass === 'positive' ? 'text-secondary'
                  : overallEdgeClass === 'negative' ? 'text-error' : 'text-tertiary'
              }`}>
                {totals.expectedValuePct > 0 ? '+' : ''}{totals.expectedValuePct.toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1.5 leading-relaxed">
              {overallEdgeClass === 'positive'
                ? `Your model thinks this parlay is undervalued by the market.`
                : overallEdgeClass === 'neutral'
                  ? `Model and market roughly agree. Edge is within calibration noise.`
                  : `Market is more optimistic than your model. Negative expected value.`}
            </p>
            {legs.some(l => l.edgeClass === 'negative') && (
              <div className="flex items-start gap-1.5 mt-2 text-[10px] text-error">
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                <span>One or more legs has negative edge and is dragging the parlay down.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-3 border border-outline-variant/30 bg-surface-container/30">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Info size={14} />
              <span className="text-[11px]">
                {totals.modelCoverage}/{legs.length} legs have model probabilities.
                Add picks from supported markets to see expected value.
              </span>
            </div>
          </div>
        )}

        {/* Stake input */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/20">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider">Stake</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStake(s => Math.max(1, s - 5))}
              className="w-7 h-7 rounded-md inline-flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Decrease stake"
            ><Minus size={12} /></button>
            <span className="min-w-[3.5rem] text-center text-sm font-bold text-on-surface tabular-nums">${stake}</span>
            <button
              onClick={() => setStake(s => s + 5)}
              className="w-7 h-7 rounded-md inline-flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Increase stake"
            ><Plus size={12} /></button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-on-surface-variant">If it wins</span>
          <span className="text-sm font-bold text-neon tabular-nums">${totals.expectedReturn.toFixed(2)}</span>
        </div>
        {totals.expectedProfit != null && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-on-surface-variant">Expected profit</span>
            <span className={`text-sm font-bold tabular-nums ${
              totals.expectedProfit > 0 ? 'text-secondary' : 'text-error'
            }`}>
              {totals.expectedProfit > 0 ? '+' : ''}${totals.expectedProfit.toFixed(2)}
            </span>
          </div>
        )}

        <p className="text-[10px] text-on-surface-variant/60 text-center mt-3 leading-relaxed">
          Simulation only — for analytical purposes.
        </p>
      </div>
    </motion.div>
  );
}

// ─── EDGE ROW (per leg) ─────────────────────────────────────────────
function EdgeRow({ leg }) {
  const hasModel = leg.modelProb != null;
  const edgePct = hasModel ? (leg.edge * 100) : null;

  return (
    <div className="grid grid-cols-3 gap-2 text-[11px] mt-1.5">
      <Mini label="Market"
        value={`${(leg.marketImplied * 100).toFixed(1)}%`}
        tone="muted" />
      <Mini label="Model"
        value={hasModel ? `${(leg.modelProb * 100).toFixed(1)}%` : '—'}
        tone="muted" />
      <Mini label="Edge"
        value={hasModel
          ? `${edgePct > 0 ? '+' : ''}${edgePct.toFixed(1)}%`
          : '—'}
        tone={leg.edgeClass} />
    </div>
  );
}

function Mini({ label, value, tone }) {
  const valueColor =
    tone === 'positive' ? 'text-secondary' :
    tone === 'negative' ? 'text-error' :
    tone === 'neutral'  ? 'text-tertiary' :
    'text-on-surface';
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-on-surface-variant/60">{label}</span>
      <span className={`font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}

function SummaryStat({ label, value, sub }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[9px] uppercase tracking-wider text-on-surface-variant/70 mb-0.5">{label}</span>
      <span className="text-base font-bold text-on-surface tabular-nums leading-tight">{value}</span>
      <span className="text-[9px] text-on-surface-variant/60">{sub}</span>
    </div>
  );
}
