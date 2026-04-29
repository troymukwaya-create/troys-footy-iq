import React from 'react';
import { useOdds, useValueEdges } from '../hooks/useQueries.js';
import { useStore } from '../store/useStore.js';

/**
 * LiveOddsPanel — Displays bookmaker odds for a selected fixture.
 * Shows 1X2, Over/Under 2.5, and BTTS markets.
 * Highlights best odds per outcome. Click an outcome to add to parlay.
 */
export function LiveOddsPanel({ fixture }) {
  const fixtureId = fixture?.id;
  const { data: oddsData, isLoading } = useOdds(fixtureId);
  const { data: valueData } = useValueEdges(fixtureId);
  const { addParlaySelection, parlaySelections } = useStore();

  if (!fixture) return null;

  if (isLoading) {
    return (
      <div className="p-4">
        <h3 className="text-xs font-bold text-white/50 tracking-widest mb-3">LIVE ODDS</h3>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white/[0.02] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const markets = oddsData?.markets || {};
  const edges = valueData?.edges || [];

  const isInParlay = (outcome, market) =>
    parlaySelections.some(s => s.fixtureId === fixtureId && s.outcome === outcome && s.market === market);

  const handleAddToParlay = (outcome, odd, market, label) => {
    addParlaySelection({
      fixtureId,
      fixtureName: `${fixture.homeTeam?.name || '?'} vs ${fixture.awayTeam?.name || '?'}`,
      outcome,
      odd,
      market,
      marketLabel: label,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white/50 tracking-widest">LIVE ODDS</h3>
        <span className="text-[9px] text-white/20">
          {oddsData?.bookmakerCount || 0} bookmakers
        </span>
      </div>

      {/* 1X2 Market */}
      {markets['1X2'] && (
        <MarketCard
          market={markets['1X2']}
          edges={edges}
          fixtureId={fixtureId}
          isInParlay={isInParlay}
          onAdd={handleAddToParlay}
        />
      )}

      {/* Over/Under 2.5 */}
      {markets['OU25'] && (
        <MarketCard
          market={markets['OU25']}
          edges={[]}
          fixtureId={fixtureId}
          isInParlay={isInParlay}
          onAdd={handleAddToParlay}
        />
      )}

      {/* BTTS */}
      {markets['BTTS'] && (
        <MarketCard
          market={markets['BTTS']}
          edges={[]}
          fixtureId={fixtureId}
          isInParlay={isInParlay}
          onAdd={handleAddToParlay}
        />
      )}

      {/* Value Edge Summary */}
      {edges.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-bold text-white/40 tracking-widest mb-2">MODEL vs MARKET</h4>
          <div className="space-y-1.5">
            {edges.map(e => (
              <ValueEdgeRow key={e.outcome} edge={e} />
            ))}
          </div>
        </div>
      )}

      {Object.keys(markets).length === 0 && !isLoading && (
        <div className="text-center py-6 text-white/30">
          <div className="text-lg mb-1">📊</div>
          <div className="text-[10px]">No odds available for this fixture</div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ market, edges, fixtureId, isInParlay, onAdd }) {
  if (!market?.bookmakers?.length) return null;

  const bestOdds = market.bestOdds || {};

  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      {/* Market Header */}
      <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.04]">
        <span className="text-[10px] font-bold text-cyan-400/80 tracking-wider">
          {market.label}
        </span>
      </div>

      {/* Outcomes Header */}
      <div className="px-3 py-1.5 grid gap-1" style={{
        gridTemplateColumns: `120px repeat(${market.bookmakers[0]?.outcomes?.length || 3}, 1fr)`
      }}>
        <span className="text-[9px] text-white/25">Bookmaker</span>
        {(market.bookmakers[0]?.outcomes || []).map(o => (
          <span key={o.name} className="text-[9px] text-white/25 text-center">{o.name}</span>
        ))}
      </div>

      {/* Bookmaker Rows */}
      {market.bookmakers.map(bk => (
        <div key={bk.name} className="px-3 py-1.5 border-t border-white/[0.02] grid gap-1 hover:bg-white/[0.02] transition-colors" style={{
          gridTemplateColumns: `120px repeat(${bk.outcomes.length}, 1fr)`
        }}>
          <span className="text-[10px] text-white/50 truncate flex items-center gap-1">
            {bk.isTop && <span className="w-1 h-1 rounded-full bg-cyan-400/60" />}
            {bk.name}
          </span>
          {bk.outcomes.map(o => {
            const isBest = bestOdds[o.name]?.odd === o.odd && bestOdds[o.name]?.bookmaker === bk.name;
            const selected = isInParlay(o.name, market.market);
            return (
              <button
                key={o.name}
                onClick={() => onAdd(o.name, o.odd, market.market, market.label)}
                className={`text-center rounded py-1 text-[11px] font-semibold tabular-nums transition-all cursor-pointer ${
                  selected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : isBest
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                    : 'bg-white/[0.03] text-white/70 border border-transparent hover:bg-white/[0.06]'
                }`}
              >
                {o.odd.toFixed(2)}
              </button>
            );
          })}
        </div>
      ))}

      {/* Implied Probability Footer */}
      <div className="px-3 py-1.5 bg-white/[0.01] border-t border-white/[0.03] grid gap-1" style={{
        gridTemplateColumns: `120px repeat(${market.bookmakers[0]?.outcomes?.length || 3}, 1fr)`
      }}>
        <span className="text-[8px] text-white/20">Implied %</span>
        {(market.bookmakers[0]?.outcomes || []).map(o => (
          <span key={o.name} className="text-[8px] text-white/25 text-center tabular-nums">
            {o.impliedProbability}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ValueEdgeRow({ edge }) {
  const color = edge.signal === 'STRONG_VALUE' ? 'text-emerald-400'
    : edge.signal === 'VALUE' ? 'text-emerald-300/80'
    : edge.signal === 'FAIR' ? 'text-white/50'
    : 'text-red-400/70';

  const bgColor = edge.signal === 'STRONG_VALUE' ? 'bg-emerald-500/10 border-emerald-500/20'
    : edge.signal === 'VALUE' ? 'bg-emerald-500/5 border-emerald-500/10'
    : edge.signal === 'FAIR' ? 'bg-white/[0.02] border-white/[0.04]'
    : 'bg-red-500/5 border-red-500/10';

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${bgColor}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/60 font-medium w-10">{edge.outcome}</span>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-[8px] text-white/30">Model</div>
            <div className="text-[11px] font-bold text-cyan-400 tabular-nums">{edge.modelProbability}%</div>
          </div>
          <div className="text-white/15">vs</div>
          <div className="text-center">
            <div className="text-[8px] text-white/30">Market</div>
            <div className="text-[11px] font-bold text-white/60 tabular-nums">{edge.bookmakerProbability}%</div>
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-bold tabular-nums ${color}`}>
          {edge.valueEdge > 0 ? '+' : ''}{edge.valueEdge}%
        </div>
        <div className={`text-[8px] ${color}`}>
          {edge.signal === 'STRONG_VALUE' ? '🔥 Strong Value' :
           edge.signal === 'VALUE' ? '✨ Value' :
           edge.signal === 'FAIR' ? 'Fair' : 'No Value'}
        </div>
      </div>
    </div>
  );
}
