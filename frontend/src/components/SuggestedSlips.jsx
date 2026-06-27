import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, Trophy, Gem, Shield, Rocket } from 'lucide-react';
import { useStore } from '../store/useStore.js';

// ─── SANITY RAILS ────────────────────────────────────────────────────
// A slip is a recommendation; a recommendation with a six-figure multiplier
// is a credibility bug, not a bet. Legs and slips outside these bounds are
// DROPPED, never displayed: garbage-in must not become a headline number.
const MAX_LEG_ODDS = 15;      // no single 1X2 leg above 15.00
const MAX_SLIP_ODDS = 250;    // no acca above 250.00
const MAX_SLIP_EV_PCT = 100;  // an EV above +100% means the inputs are wrong

// Build a single 1X2 leg for a fixture + outcome, recovering the bookmaker's
// implied odds from the model probability and the published value edge so the
// slip's edge/EV math stays meaningful.
function outcomeLeg(f, outcome) {
  const probs = f.probability?.probabilities || {};
  const edges = f.probability?.valueEdges || {};
  const mp = (probs[outcome] ?? 0) / 100;
  if (mp <= 0) return null;
  const edge = (edges[outcome] ?? 0) / 100;
  const marketImplied = Math.min(0.99, mp - edge);
  // Reconstructed odds beyond the rail mean the edge data is broken for this
  // fixture (a clamped market prob once produced a "631250× Value Acca").
  if (!(marketImplied > 0) || 1 / marketImplied > MAX_LEG_ODDS) return null;
  const odds = 1 / marketImplied;
  const label = outcome === 'home' ? `${f.homeTeam?.name} win`
    : outcome === 'away' ? `${f.awayTeam?.name} win` : 'Draw';
  return {
    matchId: f.id,
    matchLabel: `${f.homeTeam?.name} v ${f.awayTeam?.name}`,
    marketType: '1X2',
    outcome: label,
    odds: Number(odds.toFixed(2)),
    modelProbability: mp,
    _edge: edge,
    _mp: mp,
  };
}

function favOutcome(f) {
  const p = f.probability?.probabilities;
  if (!p) return null;
  if (p.home >= p.draw && p.home >= p.away) return 'home';
  if (p.away >= p.draw && p.away >= p.home) return 'away';
  return 'draw';
}

function bestEdgeOutcome(f) {
  const e = f.probability?.valueEdges;
  if (!e) return null;
  const arr = [['home', e.home ?? -1], ['draw', e.draw ?? -1], ['away', e.away ?? -1]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][1] > 0 ? arr[0][0] : null;
}

function buildSlips(fixtures) {
  const pool = (fixtures || []).filter(f =>
    f.probability?.probabilities && f.status !== 'FINISHED' && f.status !== 'FT' && f.homeTeam?.name && f.awayTeam?.name
  );
  const slips = [];

  // 💎 Value Acca — biggest positive edges vs the bookies
  const valueLegs = pool
    .map(f => { const o = bestEdgeOutcome(f); return o ? outcomeLeg(f, o) : null; })
    .filter(Boolean)
    .sort((a, b) => b._edge - a._edge)
    .slice(0, 4);
  if (valueLegs.length >= 2) slips.push({ id: 'value', icon: Gem, title: 'Value Acca', subtitle: 'Where the model most disagrees with the bookies', legs: valueLegs });

  // 🛡️ Banker Treble — highest-confidence favourites
  const bankerLegs = pool
    .map(f => { const o = favOutcome(f); return o ? outcomeLeg(f, o) : null; })
    .filter(Boolean)
    .sort((a, b) => b._mp - a._mp)
    .slice(0, 3);
  if (bankerLegs.length >= 2) slips.push({ id: 'banker', icon: Shield, title: 'Banker Treble', subtitle: 'Our three highest-confidence picks', legs: bankerLegs });

  // 🚀 Long-shot — higher-odds favourites stacked for a big return
  const longLegs = pool
    .map(f => { const o = favOutcome(f); return o ? outcomeLeg(f, o) : null; })
    .filter(Boolean)
    .filter(l => l._mp < 0.5)
    .sort((a, b) => b.odds - a.odds)
    .slice(0, 4);
  if (longLegs.length >= 3) slips.push({ id: 'longshot', icon: Rocket, title: 'Long-shot', subtitle: 'High odds, high reward — edge shown honestly', legs: longLegs });

  // 🏆 World Cup Special — tournament-only acca, pinned to the top
  const wc = pool.filter(f => f.league?.code === 'WC' || /world cup/i.test(f.league?.name || ''));
  const wcLegs = wc
    .map(f => { const o = bestEdgeOutcome(f) || favOutcome(f); return o ? outcomeLeg(f, o) : null; })
    .filter(Boolean)
    .sort((a, b) => b._mp - a._mp)
    .slice(0, 4);
  if (wcLegs.length >= 2) slips.unshift({ id: 'wc', icon: Trophy, title: 'World Cup Special', subtitle: 'A tournament acca for the big kickoff', legs: wcLegs, highlight: true });

  // Final rail: any slip whose combined numbers are outside the believable
  // range is dropped entirely — we'd rather show fewer slips than one absurd one.
  return slips.filter(s => {
    const m = slipMetrics(s.legs);
    return m.odds <= MAX_SLIP_ODDS && m.evPct <= MAX_SLIP_EV_PCT;
  });
}

function slipMetrics(legs) {
  let odds = 1, modelJoint = 1;
  for (const l of legs) { odds *= l.odds; modelJoint *= (l.modelProbability || 0); }
  return { odds, evPct: (modelJoint * odds - 1) * 100, modelPct: modelJoint * 100 };
}

export function SuggestedSlips({ fixtures }) {
  const { addParlaySelection, clearParlay } = useStore();
  const slips = useMemo(() => buildSlips(fixtures), [fixtures]);
  if (slips.length === 0) return null;

  const load = (legs) => {
    clearParlay();
    legs.slice(0, 6).forEach(l => addParlaySelection({
      matchId: l.matchId, matchLabel: l.matchLabel, marketType: l.marketType,
      outcome: l.outcome, odds: l.odds, modelProbability: l.modelProbability,
    }));
  };

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
        <Sparkles size={15} style={{ color: 'var(--accent)' }} /> Suggested Slips
      </h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Ready-made accas from the model — tap to load, tweak, then copy to your bookmaker.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slips.map((s, i) => {
          const m = slipMetrics(s.legs);
          const good = m.evPct > 1;
          return (
            <motion.button
              key={s.id}
              onClick={() => load(s.legs)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.98 }}
              style={{
                textAlign: 'left', width: '100%', cursor: 'pointer', padding: 12, borderRadius: 'var(--radius-md)',
                background: s.highlight ? 'var(--accent-muted)' : 'var(--bg-raised)',
                border: `1px solid ${s.highlight ? 'rgba(192,57,43,0.3)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><s.icon size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} /> {s.title}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{m.odds.toFixed(2)}×</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.4 }}>{s.subtitle}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{s.legs.length} legs · {Math.round(m.modelPct)}% model</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: good ? '#22c55e' : 'var(--text-muted)' }}>
                  {good ? `+${m.evPct.toFixed(0)}% edge` : 'fair value'} <ArrowRight size={12} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
