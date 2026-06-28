import React, { useMemo, useCallback } from 'react';
import { useMarkets } from '../hooks/useQueries.js';
import { useStore } from '../store/useStore.js';

/**
 * MarketsPanel — Outcome-grouped odds display with value insights.
 * Replaces the old LiveOddsPanel with a decision-oriented layout.
 * Each market groups outcomes (not bookmakers) as primary rows.
 */
export function MarketsPanel({ fixture }) {
  const fixtureId = fixture?.id;
  const { data: markets, isLoading } = useMarkets(fixtureId);

  // Find value picks across all markets
  const valuePicks = useMemo(() => {
    if (!Array.isArray(markets)) return [];
    const picks = [];
    for (const market of markets) {
      for (const outcome of market.outcomes || []) {
        if (outcome.value_signal === 'STRONG_VALUE' || outcome.value_signal === 'VALUE') {
          picks.push({ ...outcome, marketLabel: market.label, marketType: market.type });
        }
      }
    }
    return picks.sort((a, b) => (b.value_edge || 0) - (a.value_edge || 0)).slice(0, 3);
  }, [markets]);

  // Guard AFTER all hooks so the hook order is stable (was a Rules-of-Hooks bug).
  if (!fixture) return null;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="section-title">Markets</div>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    );
  }

  if (!Array.isArray(markets) || markets.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          No odds available
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Odds data is not available for this fixture yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* AI Suggested Picks */}
      {valuePicks.length > 0 && (
        <ValuePicksBanner
          picks={valuePicks}
          fixture={fixture}
        />
      )}

      {/* Market Sections */}
      {markets.map(market => (
        <MarketSection
          key={market.type}
          market={market}
          fixture={fixture}
        />
      ))}
    </div>
  );
}

// ─── VALUE PICKS BANNER ──────────────────────────────────────────────

function ValuePicksBanner({ picks, fixture }) {
  const { addParlaySelection, parlaySelections } = useStore();

  const addAllToParlay = useCallback(() => {
    if (picks.length === 0) return;
    // Add the best pick for this match
    const pick = picks[0];
    addParlaySelection({
      matchId: fixture.id,
      marketType: pick.marketType,
      outcome: pick.name,
      odds: pick.best_odds,
      bookmaker: pick.best_bookmaker,
      matchLabel: `${fixture.homeTeam?.name || '?'} vs ${fixture.awayTeam?.name || '?'}`,
    });
  }, [picks, fixture, addParlaySelection]);

  return (
    <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--success)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.04em' }}>
            VALUE PICKS
          </span>
        </div>
        <button
          onClick={addAllToParlay}
          style={{
            padding: '4px 12px', borderRadius: 'var(--radius-sm)',
            background: 'var(--success-muted)', border: '1px solid rgba(34,197,94,0.2)',
            color: 'var(--success)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseOver={e => e.target.style.background = 'rgba(34,197,94,0.2)'}
          onMouseOut={e => e.target.style.background = 'var(--success-muted)'}
        >
          Add Best to Parlay
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {picks.map((pick, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(34,197,94,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {pick.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {pick.marketLabel}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {pick.best_odds.toFixed(2)}
              </span>
              <ValueTag edge={pick.value_edge} signal={pick.value_signal} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MARKET SECTION ──────────────────────────────────────────────────

function MarketSection({ market, fixture }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Market Header */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.03em' }}>
          {market.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {(market.outcomes?.[0]?.odds?.length || 0)} bookmakers
        </span>
      </div>

      {/* Outcome Cards */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {(market.outcomes || []).map((outcome, idx) => (
          <OutcomeCard
            key={outcome.name}
            outcome={outcome}
            marketType={market.type}
            marketLabel={market.label}
            fixture={fixture}
            isLast={idx === (market.outcomes?.length || 0) - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── OUTCOME CARD ────────────────────────────────────────────────────

function OutcomeCard({ outcome, marketType, marketLabel, fixture, isLast }) {
  const { addParlaySelection, parlaySelections } = useStore();

  const matchId = fixture?.id;
  const currentSelection = parlaySelections.find(s => s.matchId === matchId);
  const isSelected = currentSelection?.outcome === outcome.name && currentSelection?.marketType === marketType;
  const matchHasOtherSelection = currentSelection && !isSelected;

  const handleSelect = useCallback(() => {
    addParlaySelection({
      matchId,
      marketType,
      outcome: outcome.name,
      odds: outcome.best_odds,
      bookmaker: outcome.best_bookmaker,
      matchLabel: `${fixture.homeTeam?.name || '?'} vs ${fixture.awayTeam?.name || '?'}`,
    });
  }, [matchId, marketType, outcome, fixture, addParlaySelection]);

  const alternatives = (outcome.odds || []).slice(1, 4);

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      transition: 'background 150ms ease',
      background: isSelected ? 'rgba(192,57,43,0.10)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {/* Left: Outcome info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {outcome.name}
            </span>
            {outcome.value_signal && (
              <ValueTag edge={outcome.value_edge} signal={outcome.value_signal} />
            )}
          </div>

          {/* Best odds */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
            }}>
              {outcome.best_odds.toFixed(2)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {outcome.best_bookmaker}
            </span>
          </div>

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {alternatives.map((alt, i) => (
                <span key={i} style={{
                  fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {alt.value.toFixed(2)} <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{alt.bookmaker}</span>
                </span>
              ))}
            </div>
          )}

          {/* Value Insights */}
          {outcome.model_probability != null && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <ProbPill label="Model" value={(outcome.model_probability * 100).toFixed(1)} color="var(--accent)" />
              <ProbPill label="Market" value={(outcome.market_probability * 100).toFixed(1)} color="var(--text-tertiary)" />
              {outcome.value_edge != null && (
                <ProbPill
                  label="Edge"
                  value={`${outcome.value_edge > 0 ? '+' : ''}${(outcome.value_edge * 100).toFixed(1)}`}
                  color={outcome.value_edge >= 0.02 ? 'var(--success)' : outcome.value_edge <= -0.02 ? 'var(--danger)' : 'var(--text-tertiary)'}
                  bold
                />
              )}
            </div>
          )}
        </div>

        {/* Right: Select button */}
        <button
          onClick={handleSelect}
          disabled={matchHasOtherSelection && parlaySelections.length >= 3}
          style={{
            padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            border: isSelected
              ? '1px solid var(--accent)'
              : '1px solid var(--border-default)',
            background: isSelected
              ? 'var(--accent-muted)'
              : matchHasOtherSelection
                ? 'transparent'
                : 'var(--bg-raised)',
            color: isSelected
              ? 'var(--accent)'
              : matchHasOtherSelection
                ? 'var(--text-muted)'
                : 'var(--text-secondary)',
            fontSize: 11, fontWeight: 700, transition: 'all 150ms ease',
            opacity: matchHasOtherSelection ? 0.4 : 1,
            flexShrink: 0,
          }}
          onMouseOver={e => {
            if (!matchHasOtherSelection) e.target.style.borderColor = 'var(--accent)';
          }}
          onMouseOut={e => {
            if (!isSelected) e.target.style.borderColor = 'var(--border-default)';
          }}
        >
          {isSelected ? '✓ Selected' : 'Select'}
        </button>
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────

function ValueTag({ edge, signal }) {
  if (!signal) return null;

  const config = {
    STRONG_VALUE: { label: 'Strong Value', color: 'var(--success)', bg: 'var(--success-muted)', icon: '🔥' },
    VALUE:        { label: 'Value', color: 'var(--success)', bg: 'var(--success-muted)', icon: '✨' },
    FAIR:         { label: 'Fair', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.04)', icon: '' },
    NO_VALUE:     { label: 'No Value', color: 'var(--danger)', bg: 'var(--danger-muted)', icon: '' },
  };

  const c = config[signal] || config.FAIR;

  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: c.bg, color: c.color, letterSpacing: '0.02em',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {c.icon && <span style={{ fontSize: 8 }}>{c.icon}</span>}
      {edge != null && `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`}
      {!edge && c.label}
    </span>
  );
}

function ProbPill({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: bold ? 700 : 600, color, fontVariantNumeric: 'tabular-nums',
      }}>
        {value}%
      </span>
    </div>
  );
}
