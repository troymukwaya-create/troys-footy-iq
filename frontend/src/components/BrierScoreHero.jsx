import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { TrendingDown, Info, Activity } from 'lucide-react';
import api from '../api/client.js';
import { barFill, numberRoll } from '../lib/motion.js';
import DotGrid from './reactbits/DotGrid.jsx';
import DecryptedText from './reactbits/DecryptedText.jsx';
import CountUp from './reactbits/CountUp.jsx';

// ─── BENCHMARKS ─────────────────────────────────────────────────────
// Brier score (proper scoring rule for probabilistic forecasts).
// Lower is better. These are the conventional reference values.
const BENCHMARKS = {
  worst:        { value: 0.250, label: 'Coin flip' },
  random:       { value: 0.222, label: 'Random' },
  tipster:      { value: 0.205, label: 'Avg tipster' },
  sharpMarket:  { value: 0.190, label: 'Sharp market' },
  best:         { value: 0.150, label: 'Theoretical best' },
};

// Map a score to a horizontal position (0–100%) on the visual scale.
// The scale is inverted: lower Brier = further right (better).
function scoreToPosition(score) {
  const { worst, best } = BENCHMARKS;
  const clamped = Math.max(best.value, Math.min(worst.value, score));
  return ((worst.value - clamped) / (worst.value - best.value)) * 100;
}

// ─── TWO-TONE ANIMATED NUMBER ────────────────────────────────────────
// "0." in calibration-slate, significant digits in brier-oxblood.
// font-feature-settings tnum (tabular) + ss02 (slashed zero) for IBM Plex Mono.
function TwoToneNumber({ value, className }) {
  const motionValue = useMotionValue(0);
  const digits = useTransform(motionValue, latest => {
    const str = latest.toFixed(3);
    return str.slice(2); // e.g. "187" from "0.187"
  });
  useEffect(() => {
    const controls = animate(motionValue, value, numberRoll);
    return () => controls.stop();
  }, [value, motionValue]);

  return (
    <span
      className={className}
      style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum", "ss02"' }}
    >
      <span style={{ color: 'var(--calibration-slate)' }}>0.</span>
      <motion.span style={{ color: 'var(--accent)' }}>{digits}</motion.span>
    </span>
  );
}

// ─── HERO COMPONENT ─────────────────────────────────────────────────
export default function BrierScoreHero() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/performance')
      .then(res => {
        if (cancelled) return;
        const d = res?.data?.data;
        const brier = d?.overall?.avg_brier ?? d?.brierScore ?? null;
        const total = d?.overall?.total_predictions ?? d?.sampleSize ?? null;
        const lastEval = d?.overall?.last_evaluation ?? null;
        // If we got a real value, use it. Otherwise fall back to the
        // known PL backtest result so the hero always renders something true.
        setData({
          brier: brier && brier > 0 ? Number(brier) : 0.187,
          sampleSize: total || 380,
          lastUpdated: lastEval,
          source: brier && brier > 0 ? 'live' : 'backtest',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setData({ brier: 0.187, sampleSize: 380, lastUpdated: null, source: 'backtest' });
      });
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return (
      <div className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container/60 p-6 animate-pulse">
        <div className="h-4 w-32 bg-surface-container-high rounded mb-4" />
        <div className="h-12 w-48 bg-surface-container-high rounded mb-4" />
        <div className="h-2 w-full bg-surface-container-high rounded" />
      </div>
    );
  }

  const ourPosition = scoreToPosition(data.brier);
  const beatsRandom = data.brier < BENCHMARKS.random.value;
  const beatsTipster = data.brier < BENCHMARKS.tipster.value;
  const beatsSharpMarket = data.brier < BENCHMARKS.sharpMarket.value;

  const isBacktest = data.source !== 'live';
  // n is tiny in the tournament's first days — a hot Brier on 1–19
  // matches is luck-compatible, and saying so is the whole brand.
  const smallSample = !isBacktest && data.sampleSize < 20;
  const headline = isBacktest
    ? 'Backtested — live World Cup record starts at kick-off'
    : smallSample
      ? `Live scoring has started — early days (${data.sampleSize} ${data.sampleSize === 1 ? 'match' : 'matches'})`
      : beatsSharpMarket
        ? 'Beating the sharp market'
        : beatsTipster
          ? 'Beating the average analyst'
          : beatsRandom
            ? 'Beating random chance'
            : 'Calibrating';

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      className="w-full rounded-2xl border border-outline-variant/30 bg-gradient-to-br from-surface-container to-surface-container-low p-6 sm:p-8 shadow-lg shadow-black/20"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <DotGrid gap={22} dot={1.1} color="rgba(192,57,43,0.11)" />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Top row: label + last updated */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            <Activity size={12} style={{ color: 'var(--accent)' }} />
            Model Accuracy
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant/70" title="Lower Brier score = better-calibrated probability predictions">
            <Info size={11} />
            Brier score
          </span>
        </div>
        <span className="text-[11px] text-on-surface-variant/60">
          {data.source === 'live'
            ? `Updated · ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString() : 'today'}`
            : 'Premier League backtest'}
        </span>
      </div>

      {/* Headline number + statement */}
      <div className="flex items-end justify-between gap-6 mb-7 flex-wrap">
        <div>
          <div className="flex items-end gap-3">
            <TwoToneNumber
              value={data.brier}
              className="text-5xl sm:text-6xl font-bold tabular-nums tracking-tight leading-none"
            />
            <span className="mb-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--calibration-slate)' }}>BRIER</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              <TrendingDown size={14} />
              <DecryptedText key={headline} text={headline} speed={26} />
            </span>
            <span className="text-xs text-on-surface-variant">
              · {data.sampleSize.toLocaleString()} {isBacktest ? 'backtested (PL)' : 'scored live'}
            </span>
          </div>
        </div>
        <div className="text-right hidden sm:block max-w-xs">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Brier score measures how calibrated our probability predictions are
            against actual outcomes. Lower is better. We publish ours.
          </p>
        </div>
      </div>

      {/* Scale */}
      <div className="relative pt-2 pb-10">
        {/* Background track */}
        <div className="relative h-2 rounded-full bg-surface-container-highest overflow-hidden">
          {/* Filled portion up to our score */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${ourPosition}%` }}
            transition={barFill}
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: 'linear-gradient(to right, rgba(192,57,43,0.3), var(--accent))' }}
          />
        </div>

        {/* Benchmark markers */}
        {Object.entries(BENCHMARKS).filter(([k]) => k !== 'worst' && k !== 'best').map(([key, b]) => {
          const pos = scoreToPosition(b.value);
          return (
            <div
              key={key}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${pos}%` }}
            >
              <div className="w-px h-4 bg-on-surface-variant/40" />
              {/* Text labels crowd on phones — hide them there; the vs-callout row below carries the comparison */}
              <div className="hidden sm:block text-[10px] text-on-surface-variant/70 whitespace-nowrap mt-1 -translate-x-1/2 ml-1">
                {b.label}
              </div>
              <div className="hidden sm:block text-[10px] text-on-surface-variant/50 tabular-nums whitespace-nowrap -translate-x-1/2 ml-1">
                {b.value.toFixed(3)}
              </div>
            </div>
          );
        })}

        {/* Our marker — emphasized */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', damping: 14, stiffness: 320 }}
          className="absolute top-0 -translate-x-1/2 z-10"
          style={{ left: `${ourPosition}%` }}
        >
          <div className="w-1 h-5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgba(192,57,43,0.5)' }} />
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shadow-md" style={{ background: 'var(--accent)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>
            YOU · {data.brier.toFixed(3)}
          </div>
        </motion.div>
      </div>

      {/* Sub-row: callouts */}
      <div className="grid grid-cols-3 gap-3 mt-3 pt-4 border-t border-outline-variant/20">
        <Stat label="vs Random"       points={(BENCHMARKS.random.value - data.brier) * 1000} />
        <Stat label="vs Avg Tipster"  points={(BENCHMARKS.tipster.value - data.brier) * 1000} />
        <Stat label="vs Sharp Market" points={(BENCHMARKS.sharpMarket.value - data.brier) * 1000} />
      </div>
      </div>
    </motion.section>
  );
}

// `points` is the signed Brier-points difference (positive = we're better).
// Sign + label are derived from it, so we never render the old "+-12" bug.
function Stat({ label, points }) {
  const better = points >= 0;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/70 mb-1">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <CountUp
          value={Math.abs(points)}
          prefix={better ? '+' : '−'}
          duration={1100}
          className={`text-lg font-bold tabular-nums ${better ? 'text-calibration-cyan' : 'text-error'}`}
        />
        <span className="text-[10px] text-on-surface-variant/60">{better ? 'pts better' : 'pts behind'}</span>
      </div>
    </div>
  );
}
