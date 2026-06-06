import React, { useEffect } from 'react';
import { useDemoDashboard, useDemoPredictions, useDemoStatus, useDemoControls } from '../hooks/useDemoQueries.js';

export function InvestorDashboard({ onClose }) {
  const { data: status, isLoading: statusLoading } = useDemoStatus();
  const { data: dashboard, isLoading: dashLoading } = useDemoDashboard();
  const { data: predictionsData, isLoading: predsLoading } = useDemoPredictions();
  const { activateDemo, deactivateDemo, activateKillSwitch, deactivateKillSwitch } = useDemoControls();

  // Auto-activate demo mode when opening if not active
  useEffect(() => {
    if (status && !status.system.demoMode && !activateDemo.isPending) {
      activateDemo.mutate();
    }
  }, [status, activateDemo]);

  if (statusLoading || dashLoading || predsLoading || !dashboard) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: '#0a0a0c', color: '#fff' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-t-[#00e5ff] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <div className="text-sm font-semibold tracking-widest text-gray-400">INITIALIZING DEMO ENGINE...</div>
        </div>
      </div>
    );
  }

  const { model, performance, calibration, system } = dashboard;
  const matches = predictionsData?.matches || [];
  const isKillSwitch = system.killSwitch?.active;

  const handleClose = () => {
    deactivateDemo.mutate();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: '#0a0a0c', color: '#e5e7eb', fontFamily: "'Inter', sans-serif" }}>
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-10 px-8 py-4 flex justify-between items-center border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10, 10, 12, 0.8)' }}>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-black tracking-tighter">
            <span style={{ color: '#00e5ff' }}>ODD</span>YSSA
          </div>
          <div className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border" style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)' }}>
            Investor View
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">SYSTEM:</span>
            {isKillSwitch ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div> FAILSAFE ACTIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div> LIVE
              </span>
            )}
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </header>

      <div className="p-8 max-w-[1400px] mx-auto w-full flex flex-col gap-8">
        
        {/* ─── TRUTH DASHBOARD ─── */}
        <section>
          <h2 className="text-lg font-bold mb-4 tracking-tight" style={{ color: '#00e5ff' }}>TRUTH DASHBOARD</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Model Status */}
            <div className="rounded-xl border border-white/10 p-6 flex flex-col gap-2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)' }}>
              <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Model Status</div>
              <div className="text-3xl font-black" style={{ color: model.statusColor }}>{model.status}</div>
              <div className="text-xs text-gray-500 mt-2 font-mono">Version: {model.version} | Evaluated: {model.evaluatedPredictions}</div>
            </div>

            {/* Performance */}
            <div className="rounded-xl border border-white/10 p-6 flex flex-col gap-2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)' }}>
              <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex justify-between">
                <span>Holdout Accuracy</span>
                <span className="text-gray-600 text-xs">Brier: {performance.brierScore}</span>
              </div>
              <div className="text-3xl font-black text-white">{performance.accuracy}%</div>
              <div className="text-xs text-gray-500 mt-2">{performance.note}</div>
            </div>

            {/* Calibration */}
            <div className="rounded-xl border border-white/10 p-6 flex flex-col gap-2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)' }}>
              <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex justify-between">
                <span>Calibration</span>
                {calibration.ece !== null && <span className="text-gray-600 text-xs">ECE: {calibration.ece}%</span>}
              </div>
              <div className="text-3xl font-black" style={{ color: calibration.statusColor }}>{calibration.status}</div>
              <div className="text-xs text-gray-500 mt-2">{calibration.detail}</div>
            </div>

          </div>
        </section>

        {/* ─── LIVE PREDICTIONS ─── */}
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold tracking-tight" style={{ color: '#00e5ff' }}>ELITE MATCH SHOWCASE</h2>
            {isKillSwitch && (
              <div className="text-xs text-red-400 font-bold bg-red-500/10 px-3 py-1 rounded">SERVING FALLBACK DATA</div>
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {matches.map(match => (
              <div key={match.id} className="rounded-xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'rgba(255,255,255,0.02)' }}>
                {/* Match Header */}
                <div className="p-5 border-b border-white/5 flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{match.competition} • {match.round}</span>
                    <span className="text-xl font-bold mt-1 text-white">{match.homeTeam} <span className="text-gray-600 font-normal mx-2">vs</span> {match.awayTeam}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-500 mb-1">Confidence</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      match.confidence.tier === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                      match.confidence.tier === 'MEDIUM' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>{match.confidence.tier}</span>
                  </div>
                </div>

                {/* Match Body */}
                <div className="p-5 flex-1 flex flex-col gap-6">
                  {/* Probabilities */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-gray-400 mb-2">
                      <span>Home ({match.probabilities.home}%)</span>
                      <span>Draw ({match.probabilities.draw}%)</span>
                      <span>Away ({match.probabilities.away}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden flex bg-white/5">
                      <div className="h-full bg-[#00e5ff]" style={{ width: `${match.probabilities.home}%` }}></div>
                      <div className="h-full bg-gray-600" style={{ width: `${match.probabilities.draw}%` }}></div>
                      <div className="h-full bg-[#00e5ff] opacity-50" style={{ width: `${match.probabilities.away}%` }}></div>
                    </div>
                  </div>

                  {/* Top Markets & xG */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Expected Goals</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">{match.expectedGoals.total.toFixed(2)}</span>
                        <span className="text-xs text-gray-500">Total</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">H: {match.expectedGoals.home.toFixed(2)} | A: {match.expectedGoals.away.toFixed(2)}</div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {match.suggestedMarkets.map((m, i) => (
                        <div key={i} className="rounded-lg p-2 flex justify-between items-center border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <span className="text-xs font-semibold text-white">{m.market}</span>
                          <span className="text-xs font-bold" style={{ color: '#00e5ff' }}>{m.probability}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Reasoning */}
                  <div className="mt-auto">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">AI Reasoning</div>
                    <p className="text-sm text-gray-300 leading-relaxed border-l-2 pl-3" style={{ borderColor: 'rgba(0, 229, 255, 0.3)' }}>
                      {match.confidence.reasoning}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── DEMO CONTROLS ─── */}
        <section className="mt-8 pt-8 border-t border-white/10 flex justify-between items-center text-sm">
          <div className="text-gray-500 font-mono text-xs">
            API Latency: ~1-3ms (Cached) | Trust: {dashboard.model.version}
          </div>
          <div className="flex gap-4">
            {!isKillSwitch ? (
              <button 
                onClick={() => activateKillSwitch.mutate("Manual Pitch Demonstration")}
                className="px-4 py-2 rounded font-bold text-xs bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                SIMULATE DB FAILURE
              </button>
            ) : (
              <button 
                onClick={() => deactivateKillSwitch.mutate()}
                className="px-4 py-2 rounded font-bold text-xs bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 transition-colors"
              >
                RESTORE SYSTEM
              </button>
            )}
          </div>
        </section>
        
        <div className="h-12"></div> {/* Bottom padding */}
      </div>
    </div>
  );
}
