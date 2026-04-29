import React, { useState } from 'react';
import { useAIChat } from '../hooks/useQueries.js';

/**
 * AIInsightsPanel — Right panel showing AI analysis.
 * Clean hierarchy: risk → verdict → pick → insights → chat.
 * Shows a proper empty state when no fixture is selected.
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

  // ─── Empty state ────────────────────────────────────────────────
  if (!fixture) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <span style={{ fontSize: 20 }}>📊</span>
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>AI Analysis</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: 200 }}>
          Select a fixture to view AI-powered match insights and probability analysis.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 13 }}>📊</span>
          </div>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Analysis</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{home} vs {away}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ height: 64 }} />
            <div className="skeleton" style={{ height: 48 }} />
            <div className="skeleton" style={{ height: 48, width: '75%' }} />
          </div>
        )}

        {!isLoading && ai && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Risk Badge */}
            {prob?.riskLevel && (
              <div className={prob.riskLevel === 'LOW' ? 'risk-low' : prob.riskLevel === 'MEDIUM' ? 'risk-medium' : 'risk-high'}
                style={{ borderRadius: 'var(--radius-md)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>
                    {prob.riskLevel === 'LOW' ? '🟢' : prob.riskLevel === 'MEDIUM' ? '🟡' : '🔴'}
                  </span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>{prob.riskLevel} RISK</div>
                    {ai.confidence && (
                      <div style={{ fontSize: 10, opacity: 0.6 }}>{ai.confidence}% confidence</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Verdict */}
            {ai.verdict && (
              <div className="card-raised" style={{ padding: 12 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>Verdict</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ai.verdict}</p>
              </div>
            )}

            {/* Match Pattern */}
            {ai.matchPattern && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: 13 }}>⚡</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{ai.matchPattern}</span>
              </div>
            )}

            {/* Recommended Pick */}
            {ai.recommendedPick && ai.recommendedPick !== 'N/A' && (
              <div style={{
                padding: 12, borderRadius: 'var(--radius-md)',
                background: 'var(--accent-muted)', border: '1px solid rgba(59,130,246,0.15)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 4 }}>BEST PICK</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{ai.recommendedPick}</div>
                {prob?.bestPick && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{prob.bestPick.probability}% probability</div>
                )}
              </div>
            )}

            {/* Key Insights */}
            {ai.keyInsights && ai.keyInsights.length > 0 && (
              <div>
                <div className="section-title" style={{ marginBottom: 8 }}>Key Insights</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ai.keyInsights.map((insight, i) => (
                    <div key={i} className="insight-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginTop: 2, flexShrink: 0, width: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tactical Outlook */}
            {ai.tacticalExpectation && (
              <div className="card-raised" style={{ padding: 12 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>Tactical Outlook</div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{ai.tacticalExpectation}</p>
              </div>
            )}

            {/* Risk Reasoning */}
            {ai.riskReasoning && (
              <div className="card-raised" style={{ padding: 12 }}>
                <div className="section-title" style={{ marginBottom: 8, color: 'var(--warning)' }}>Risk Note</div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{ai.riskReasoning}</p>
              </div>
            )}

            {/* Low Risk Markets */}
            {prob?.lowRiskMarkets && prob.lowRiskMarkets.length > 0 && (
              <div>
                <div className="section-title" style={{ marginBottom: 8, color: 'var(--success)' }}>Low Risk Opportunities</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {prob.lowRiskMarkets.slice(0, 4).map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--success-muted)', border: '1px solid rgba(34,197,94,0.10)',
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{m.probability}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fallback */}
        {!isLoading && !ai && fixture && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)' }}>
            <div className="skeleton" style={{ height: 64, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 48, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 48, width: '75%', margin: '0 auto' }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>Loading analysis…</div>
          </div>
        )}

        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                fontSize: 12, lineHeight: 1.5, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                ...(msg.role === 'user'
                  ? { background: 'var(--accent-muted)', color: 'var(--accent)', marginLeft: 24 }
                  : { background: 'var(--bg-raised)', color: 'var(--text-tertiary)', marginRight: 24 }
                ),
              }}>
                {msg.content}
              </div>
            ))}
            {aiChat.isPending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, color: 'var(--text-muted)' }}>
                <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }} />
                <span style={{ fontSize: 11 }}>Thinking…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat Input */}
      {fixture && (
        <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              placeholder="Ask about this match…"
              style={{
                flex: 1, background: 'var(--bg-raised)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 12,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || aiChat.isPending}
              style={{
                padding: '8px 12px', background: 'var(--accent-muted)', color: 'var(--accent)',
                borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, border: 'none',
                cursor: 'pointer', opacity: !chatInput.trim() ? 0.3 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
