import React, { useState } from 'react';
import { useAIChat } from '../hooks/useQueries.js';

/**
 * AIInsightsPanel — Right sidebar showing AI analysis, risk indicator,
 * key insights, and interactive chat.
 */
export function AIInsightsPanel({ fixture, analysis, isLoading }) {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const aiChat = useAIChat();

  const ai = analysis?.ai || null;
  const prob = analysis?.probability || null;
  const home = fixture?.homeTeam?.name || 'Home';
  const away = fixture?.awayTeam?.name || 'Away';

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);

    const reply = await aiChat.mutateAsync({
      message: userMsg,
      context: { fixture, markets: prob },
      history: chatHistory.slice(-6),
    }).catch(() => 'Unable to process right now.');

    setChatHistory(prev => [...prev, { role: 'assistant', content: reply }]);
  };

  // ─── No fixture selected ─────────────────────────────────────────
  if (!fixture) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/[0.06] border border-cyan-500/10 flex items-center justify-center mb-4">
          <span className="text-2xl">🧠</span>
        </div>
        <h3 className="text-sm font-bold text-white/60 mb-2">AI Analysis</h3>
        <p className="text-[11px] text-white/30 leading-relaxed max-w-[220px]">
          Select a fixture from the left panel to view AI-powered match insights and probability analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <span className="text-sm">🧠</span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white/80">AI Analysis</h3>
            <p className="text-[9px] text-white/25">{home} vs {away}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-3/4" />
          </div>
        )}

        {!isLoading && ai && (
          <>
            {/* Risk Badge */}
            {prob?.riskLevel && (
              <div className={`rounded-xl p-3 ${
                prob.riskLevel === 'LOW' ? 'risk-low' :
                prob.riskLevel === 'MEDIUM' ? 'risk-medium' :
                'risk-high'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {prob.riskLevel === 'LOW' ? '🟢' : prob.riskLevel === 'MEDIUM' ? '🟡' : '🔴'}
                  </span>
                  <div>
                    <div className="text-[10px] font-black tracking-wider">{prob.riskLevel} RISK</div>
                    {ai.confidence && (
                      <div className="text-[9px] opacity-60">{ai.confidence}% confidence</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Verdict */}
            {ai.verdict && (
              <div className="glass-panel rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400/40 font-bold mb-2">Verdict</div>
                <p className="text-xs text-white/70 leading-relaxed">{ai.verdict}</p>
              </div>
            )}

            {/* Match Pattern */}
            {ai.matchPattern && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="text-sm">⚡</span>
                <span className="text-[11px] text-white/50 font-medium">{ai.matchPattern}</span>
              </div>
            )}

            {/* Recommended Pick */}
            {ai.recommendedPick && ai.recommendedPick !== 'N/A' && (
              <div className="rounded-xl p-3 bg-cyan-500/[0.06] border border-cyan-500/10">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400/40 font-bold mb-1">Best Pick</div>
                <div className="text-sm font-bold text-cyan-400">{ai.recommendedPick}</div>
                {prob?.bestPick && (
                  <div className="text-[10px] text-white/30 mt-0.5">{prob.bestPick.probability}% probability</div>
                )}
              </div>
            )}

            {/* Key Insights */}
            {ai.keyInsights && ai.keyInsights.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cyan-400/40 font-bold mb-2">Key Insights</div>
                <div className="space-y-2">
                  {ai.keyInsights.map((insight, i) => (
                    <div key={i} className="insight-card flex items-start gap-2">
                      <span className="text-cyan-400/50 text-[10px] font-bold mt-0.5">{i + 1}</span>
                      <span className="text-[11px] text-white/60 leading-relaxed">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tactical Expectation */}
            {ai.tacticalExpectation && (
              <div className="glass-panel rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400/40 font-bold mb-2">Tactical Outlook</div>
                <p className="text-[11px] text-white/50 leading-relaxed">{ai.tacticalExpectation}</p>
              </div>
            )}

            {/* Risk Reasoning */}
            {ai.riskReasoning && (
              <div className="glass-panel rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-widest text-amber-400/40 font-bold mb-2">Risk Note</div>
                <p className="text-[11px] text-white/40 leading-relaxed">{ai.riskReasoning}</p>
              </div>
            )}

            {/* Low Risk Markets */}
            {prob?.lowRiskMarkets && prob.lowRiskMarkets.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-400/40 font-bold mb-2">Low Risk Opportunities</div>
                <div className="space-y-1.5">
                  {prob.lowRiskMarkets.slice(0, 4).map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/10">
                      <span className="text-[11px] text-white/60">{m.name}</span>
                      <span className="text-[11px] font-bold text-emerald-400">{m.probability}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Fallback when no analysis */}
        {!isLoading && !ai && fixture && (
          <div className="text-center py-8 text-white/30">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-xs">Analysis loading...</div>
            <div className="text-[10px] text-white/20 mt-1">Data will appear shortly</div>
          </div>
        )}

        {/* Chat Messages */}
        {chatHistory.length > 0 && (
          <div className="border-t border-white/[0.04] pt-3 mt-3 space-y-2">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`text-[11px] leading-relaxed p-2.5 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-cyan-500/10 text-cyan-300/80 ml-6'
                  : 'bg-white/[0.03] text-white/50 mr-6'
              }`}>
                {msg.content}
              </div>
            ))}
            {aiChat.isPending && (
              <div className="flex items-center gap-2 p-2 text-white/30">
                <div className="w-3 h-3 border border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                <span className="text-[10px]">Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat Input */}
      {fixture && (
        <div className="p-3 border-t border-white/[0.04]">
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              placeholder="Ask about this match..."
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/70 placeholder-white/20 outline-none focus:border-cyan-500/30 transition-colors"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || aiChat.isPending}
              className="px-3 py-2 bg-cyan-500/15 text-cyan-400 rounded-lg text-xs font-semibold hover:bg-cyan-500/25 transition-colors disabled:opacity-30"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
