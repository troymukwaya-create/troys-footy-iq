import React from 'react';

/**
 * TopNav — Minimal, professional top navigation bar.
 */
export function TopNav({ onGoDashboard, fixtureSelected }) {
  return (
    <nav className="flex items-center justify-between px-4 py-2.5 bg-[#0a0e1a] border-b border-white/[0.04] z-30">
      {/* Logo */}
      <div
        onClick={onGoDashboard}
        className="flex items-center gap-2 cursor-pointer group"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/15 flex items-center justify-center group-hover:border-cyan-500/30 transition-colors">
          <span className="text-sm font-black text-cyan-400">T</span>
        </div>
        <div className="hidden sm:block">
          <span className="text-sm font-black tracking-tight">
            <span className="text-cyan-400">TROY'S</span>{' '}
            <span className="text-white/80">FOOTY</span>{' '}
            <span className="text-cyan-400">IQ</span>
          </span>
        </div>
      </div>

      {/* Center — breadcrumb */}
      <div className="flex items-center gap-2 text-[10px] text-white/30">
        {fixtureSelected && (
          <>
            <button onClick={onGoDashboard} className="hover:text-white/50 transition-colors">
              Dashboard
            </button>
            <span className="text-white/10">›</span>
            <span className="text-cyan-400/60">Match Analysis</span>
          </>
        )}
      </div>

      {/* Right — status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-white/25 hidden sm:block">Live</span>
        </div>
      </div>
    </nav>
  );
}
