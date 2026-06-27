import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useAIChat } from '../hooks/useQueries.js';
import { QEDMark } from './QEDMark.jsx';
import Spinner from './Spinner.jsx';

/**
 * AIInsightsPanel — Right panel showing AI analysis.
 * Clean hierarchy: risk → verdict → pick → insights → chat.
 * Shows a proper empty state when no fixture is selected.
 */
export function AIInsightsPanel({ fixture, analysis, isLoading, fixtures = [], onSelect }) {
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

  // ─── Empty state → AI Top Picks (always useful, even with nothing selected) ──
  if (!fixture) {
    const picks = (fixtures || [])
      .filter(f => f.probability?.probabilities && f.status !== 'FINISHED' && f.status !== 'FT')
      .map(f => {
        const p = f.probability.probabilities;
        const maxProb = Math.max(p.home ?? 0, p.draw ?? 0, p.away ?? 0);
        const edges = f.probability.valueEdges;
        const bestEdge = edges ? Math.max(edges.home ?? 0, edges.draw ?? 0, edges.away ?? 0) : 0;
        const pick = (p.home >= p.draw && p.home >= p.away) ? `${f.homeTeam?.name} win`
          : (p.away >= p.draw) ? `${f.awayTeam?.name} win` : 'Draw';
        return { f, maxProb, bestEdge, pick, score: maxProb + Math.max(0, bestEdge) * 1.2 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={15} style={{ color: 'var(--accent)' }} /> Today’s Edge
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>Our model’s strongest calls — ranked by confidence + value vs the bookies. Tap for the breakdown.</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {picks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '40px 0' }}>No matches to rate right now.</div>
          )}
          {picks.map(({ f, maxProb, bestEdge, pick }, i) => (
            <motion.button
              key={f.id}
              onClick={() => onSelect?.(f)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '11px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', width: 18, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.homeTeam?.name} v {f.awayTeam?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Pick: <strong style={{ color: 'var(--text-secondary)' }}>{pick}</strong> · {Math.round(maxProb)}%
                  {bestEdge >= 5 && <span style={{ color: '#22c55e', fontWeight: 700 }}> · +{Math.round(bestEdge)} pts vs market</span>}
                </div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 3, background: 'var(--bg-base)', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(maxProb)}%` }} transition={{ duration: 0.6, delay: 0.15 + i * 0.04, ease: [0.16, 1, 0.3, 1] }} style={{ height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>›</span>
            </motion.button>
          ))}
        </div>
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
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>The Edge</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{home} vs {away}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Content-shaped loading skeleton — mirrors the actual panel structure */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Risk / verdict block */}
            <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-md)' }} />
            {/* Pick card */}
            <div className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
            {/* Reasoning lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 12, width: '90%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 12, width: '75%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 12, width: '82%', borderRadius: 4 }} />
            </div>
            {/* Probability indicators */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="skeleton" style={{ height: 44, flex: 1, borderRadius: 'var(--radius-md)' }} />
              <div className="skeleton" style={{ height: 44, flex: 1, borderRadius: 'var(--radius-md)' }} />
              <div className="skeleton" style={{ height: 44, flex: 1, borderRadius: 'var(--radius-md)' }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              Analysing match…
            </p>
          </div>
        )}

        {!isLoading && ai && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Risk Badge */}
            {prob?.riskLevel && (
              <div className={prob.riskLevel === 'LOW' ? 'risk-low' : prob.riskLevel === 'MEDIUM' ? 'risk-medium' : 'risk-high'}
                style={{ borderRadius: 'var(--radius-md)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: prob.riskLevel === 'LOW' ? 'var(--success)' : prob.riskLevel === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)',
                  }} />
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
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <QEDMark />
                </div>
              </div>
            )}

            {/* Match Pattern */}
            {ai.matchPattern && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--margin-ochre)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{ai.matchPattern}</span>
              </div>
            )}

            {/* Recommended Pick */}
            {ai.recommendedPick && ai.recommendedPick !== 'N/A' && (
              <div style={{
                padding: 12, borderRadius: 'var(--radius-md)',
                background: 'var(--accent-muted)', border: '1px solid rgba(192,57,43,0.15)',
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
          </motion.div>
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
                <Spinner size={14} />
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
