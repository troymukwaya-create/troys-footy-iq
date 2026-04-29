import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';

/**
 * ParlayBuilder — Sticky bottom panel for building simulated parlays.
 * Users click odds to add selections, see combined odds and risk level.
 * Educational/simulation only — no real betting.
 */
export function ParlayBuilder() {
  const {
    parlaySelections,
    removeParlaySelection,
    clearParlay,
    getParlayOdds,
  } = useStore();

  const [expanded, setExpanded] = useState(false);
  const parlay = getParlayOdds();

  if (parlaySelections.length === 0) return null;

  const riskColor = parlay.risk === 'LOW' ? 'text-emerald-400'
    : parlay.risk === 'MEDIUM' ? 'text-amber-400'
    : parlay.risk === 'HIGH' ? 'text-red-400'
    : 'text-red-500';

  const riskBg = parlay.risk === 'LOW' ? 'bg-emerald-500/10 border-emerald-500/20'
    : parlay.risk === 'MEDIUM' ? 'bg-amber-500/10 border-amber-500/20'
    : 'bg-red-500/10 border-red-500/20';

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xl px-4">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0d1228]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Collapsed Bar */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-cyan-400 tracking-widest">PARLAY</span>
              <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-cyan-500/30">
                {parlaySelections.length}
              </span>
            </div>
            <span className="text-white/20">|</span>
            <span className="text-sm font-bold text-white/90 tabular-nums">
              {parlay.totalOdds.toFixed(2)}x
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskBg} ${riskColor}`}>
              {parlay.risk}
            </span>
            <svg className={`w-4 h-4 text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </button>

        {/* Expanded Content */}
        {expanded && (
          <div className="border-t border-white/[0.04]">
            {/* Selections List */}
            <div className="max-h-60 overflow-y-auto">
              {parlaySelections.map((sel, idx) => (
                <div
                  key={`${sel.fixtureId}-${sel.market}`}
                  className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-white/30 truncate">{sel.fixtureName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded">
                        {sel.marketLabel || sel.market}
                      </span>
                      <span className="text-xs font-semibold text-white/80">{sel.outcome}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-sm font-bold text-cyan-400 tabular-nums">
                      {parseFloat(sel.odd).toFixed(2)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeParlaySelection(sel.fixtureId, sel.market); }}
                      className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Footer */}
            <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.04]">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-[8px] text-white/30 tracking-wider">COMBINED ODDS</div>
                  <div className="text-lg font-bold text-white/90 tabular-nums">{parlay.totalOdds.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-white/30 tracking-wider">IMPLIED PROB</div>
                  <div className="text-lg font-bold text-white/60 tabular-nums">{parlay.impliedProb}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-white/30 tracking-wider">RISK LEVEL</div>
                  <div className={`text-lg font-bold ${riskColor}`}>{parlay.risk}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={clearParlay}
                  className="flex-1 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03] text-[10px] font-bold text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors tracking-widest cursor-pointer"
                >
                  CLEAR ALL
                </button>
              </div>

              <div className="text-[8px] text-white/15 text-center mt-2">
                Simulation only — for analytical purposes
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
