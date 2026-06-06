import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export function AIPanel({ fixture, analysis, loading }) {
  const [briefing, setBriefing] = useState(null);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!fixture) {
      axios.post('/api/ai/briefing').then(res => setBriefing(res.data)).catch(console.error);
    }
  }, [fixture]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  async function handleSend(e) {
    if (e) e.preventDefault();
    if (!input.trim() || chatLoading) return;
    
    const userMsg = input.trim();
    setInput('');
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    
    try {
      const res = await axios.post('/api/ai/chat', {
        message: userMsg,
        context: analysis,
        history: chat.slice(-4)
      });
      setChat(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      setChat(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  }

  const disclaimer = (
    <div className="px-4 py-5 text-[10px] text-on-surface-variant/30 text-center border-t border-outline-variant/10 mt-auto">
      Oddyssa is for analytical and educational purposes only.<br />
      This platform does not facilitate, encourage, or promote gambling.<br />
      All analysis is AI-generated and should not be treated as financial advice.
    </div>
  );

  // No fixture selected — Daily Briefing
  if (!fixture) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>analytics</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest font-headline">Daily Briefing</h3>
              <p className="text-[10px] text-secondary font-medium uppercase tracking-tight">System Online</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 flex flex-col">
          {briefing ? (
            <div className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-on-surface/80 italic leading-relaxed">
                "{briefing.headline}"
              </p>
              
              <div className="bg-surface-container rounded-xl p-4 border border-secondary/10">
                <div className="text-[10px] font-black text-secondary uppercase mb-3 tracking-wider">Top Analyst Pick</div>
                <div className="text-base font-bold text-on-surface mb-1">{briefing.topPick?.fixture}</div>
                <div className="text-sm text-on-surface/80 font-semibold mb-3">{briefing.topPick?.market}</div>
                <div className="text-xs text-on-surface-variant leading-relaxed">{briefing.topPick?.reasoning}</div>
              </div>
              
              <p className="text-xs text-on-surface/70 leading-relaxed">{briefing.summary}</p>
            </div>
          ) : (
            <div className="text-center mt-16 text-on-surface-variant">
              <div className="animate-pulse text-3xl mb-4">⚡</div>
              <p className="text-xs">Loading daily briefing...</p>
            </div>
          )}
          {disclaimer}
        </div>
      </div>
    );
  }

  // Fixture selected — AI Analyst
  const isReady = !loading && analysis && !analysis.error;
  const ai = analysis?.ai || {};

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-outline-variant/10 flex flex-col items-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3">
          <span className="material-symbols-outlined text-5xl text-primary glow-cyan-strong" style={{fontVariationSettings: "'FILL' 1"}}>psychology</span>
        </div>
        <h2 className="text-xs font-bold text-on-surface uppercase tracking-[0.2em] font-headline">AI Chat Assistant</h2>
        <p className="text-[10px] text-on-surface-variant mt-1">
          {fixture.homeTeam?.name} vs {fixture.awayTeam?.name}
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto flex flex-col">
        {loading ? (
          <div className="py-16 text-center text-on-surface-variant">
            <div className="animate-pulse text-3xl mb-4">⚡</div>
            <p className="text-xs">Fetching analysis...</p>
          </div>
        ) : isReady ? (
          <div className="flex flex-col flex-1">
            {/* Quick Analysis Summary */}
            <div className="p-4 border-b border-outline-variant/10">
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-3">
                <div className="text-[10px] font-black text-primary uppercase tracking-wider mb-2">Recommended Pick</div>
                <div className="text-sm font-bold text-on-surface">{ai.recommendedMarket || 'No clear pick'}</div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ai.confidence || 0}%` }} />
                  </div>
                  <span className="text-xs text-on-surface font-bold">{ai.confidence || 0}%</span>
                </div>
              </div>

              {ai.riskNote && (
                <div className="flex gap-2 text-xs text-tertiary bg-tertiary/5 p-3 rounded-lg border-l-2 border-tertiary">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  <span>{ai.riskNote}</span>
                </div>
              )}
            </div>

            {/* Low Risk Markets */}
            {analysis.lowRiskMarkets?.length > 0 && (
              <div className="p-4 border-b border-outline-variant/10">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Low Risk (≥70%)</div>
                <div className="flex flex-col gap-2">
                  {analysis.lowRiskMarkets.map((m, i) => (
                    <div key={i} className="flex justify-between items-center bg-surface-container p-3 rounded-lg border-l-2 border-secondary">
                      <span className="text-xs text-on-surface font-medium">{m.name}</span>
                      <span className="text-sm text-secondary font-bold">{m.prob}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 p-4 flex flex-col gap-3">
              <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Ask the Analyst</div>
              
              {chat.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`text-xs py-2 px-3 rounded-xl max-w-[85%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-surface-container-high text-primary border border-outline-variant/20 rounded-tr-none'
                      : 'bg-primary/5 text-on-surface/80 border border-primary/10 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-primary/5 text-on-surface-variant text-xs py-2 px-3 rounded-xl rounded-tl-none border border-primary/10 animate-pulse">
                    Thinking... ⚡
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-error text-xs px-4">
            {analysis?.error || 'Failed to load analysis.'}
          </div>
        )}
      </div>

      {/* Chat Input */}
      {isReady && (
        <form onSubmit={handleSend} className="p-3 border-t border-outline-variant/10 bg-surface/50">
          <div className="relative bg-surface-container-high rounded-lg border border-outline-variant/20 focus-within:border-primary/30 transition-colors">
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about stats, patterns..." 
              className="w-full bg-transparent text-on-surface/80 text-xs py-3 pl-3 pr-16 focus:outline-none placeholder:text-on-surface-variant/30 rounded-lg"
            />
            <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[10px] rounded transition-colors uppercase tracking-wider">
              Send
            </button>
          </div>
        </form>
      )}

      {disclaimer}
    </div>
  );
}
