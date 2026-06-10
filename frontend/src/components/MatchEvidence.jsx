import React from 'react';
import { motion } from 'motion/react';
import { Scale, Zap, TrendingUp, History, Target, FlaskConical } from 'lucide-react';

// ─── THE NUMBERS BEHIND THE CALL ─────────────────────────────────────
// The persuasion layer: every claim the model makes, backed by the data
// it was made from. Model-vs-market gap, Elo class gap, opponent form,
// head-to-head, scoreline path, and a full "how we got here" blend
// disclosure. Each block renders only when its data exists, so this
// works for every fixture — World Cup or club, rich data or thin.

const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, ui-monospace)' };

function pickOutcome(p) {
  const { home = 0, draw = 0, away = 0 } = p?.probabilities || {};
  if (home >= draw && home >= away) return 'home';
  if (away >= draw) return 'away';
  return 'draw';
}

function Block({ icon, label, children }) {
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        {React.createElement(icon, { size: 13, style: { color: 'var(--accent)' } })}
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function DuelBar({ leftLabel, leftValue, rightLabel, rightValue, leftColor, rightColor, unit = '%', max = null }) {
  const m = max ?? Math.max(leftValue || 0, rightValue || 0) ?? 1;
  const w = (v) => `${Math.max(4, ((v || 0) / (m || 1)) * 100)}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[[leftLabel, leftValue, leftColor], [rightLabel, rightValue, rightColor]].map(([lab, val, col], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 92, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lab}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} whileInView={{ width: w(val) }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', borderRadius: 4, background: col }} />
          </div>
          <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', width: 56, textAlign: 'right' }}>{val != null ? `${val}${unit}` : '–'}</span>
        </div>
      ))}
    </div>
  );
}

function Takeaway({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: 9 }}>{children}</div>;
}

function FormChips({ form }) {
  if (!form || form === 'N/A') return null;
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {String(form).replace(/[^WDL]/g, '').split('').slice(0, 5).map((r, i) => (
        <span key={i} style={{
          width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700,
          background: r === 'W' ? 'var(--success-muted)' : r === 'D' ? 'var(--warning-muted)' : 'var(--danger-muted)',
          color: r === 'W' ? 'var(--success)' : r === 'D' ? 'var(--warning)' : 'var(--danger)',
        }}>{r}</span>
      ))}
    </div>
  );
}

export function MatchEvidence({ prob, h2h, home, away, homeColor, awayColor, homeStats, awayStats }) {
  if (!prob?.probabilities) return null;

  const outcome = pickOutcome(prob);
  const pickName = outcome === 'home' ? `${home} win` : outcome === 'away' ? `${away} win` : 'Draw';
  const pickProb = prob.probabilities[outcome];
  const pickColor = outcome === 'home' ? homeColor : outcome === 'away' ? awayColor : 'var(--text-secondary)';

  const market = prob.marketProbs?.[outcome];
  const edge = prob.valueEdges?.[outcome];
  const hasEdge = Number.isFinite(edge);

  const ns = prob.nationalStrength;
  const eloGap = ns ? Math.abs(ns.homeElo - ns.awayElo) : null;
  const eloLeader = ns ? (ns.homeElo >= ns.awayElo ? home : away) : null;

  // Form: deep WC intelligence first, league stats as the club fallback.
  const hForm = prob.intelligence?.home || homeStats;
  const aForm = prob.intelligence?.away || awayStats;
  const winRate = (f) => f?.winRate ?? (f?.played ? Math.round((f.wins / f.played) * 100) : null);

  const top = prob.topScorelines?.[0];
  const over25 = prob.overUnder?.over25;
  const goalsLean = over25 != null ? (over25 >= 50 ? `Over 2.5 at ${over25}%` : `Under 2.5 at ${prob.overUnder?.under25}%`) : null;

  const conf = prob.confidence;
  const evidence = prob.evidence;

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Header — the claim this card is about to prove */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>THE NUMBERS BEHIND THE CALL</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: pickColor }}>{pickName}</span>
          <span style={{ ...mono, fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{pickProb}%</span>
          {hasEdge && edge > 1 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--success-muted)', color: 'var(--success)' }}>+{edge.toFixed(1)}pp vs market</span>
          )}
        </div>
      </div>

      {/* 1 — Model vs Market: the proof of value (or honest agreement) */}
      {market != null && (
        <Block icon={Scale} label="OUR MODEL vs THE BETTING MARKET">
          <DuelBar
            leftLabel="Our model" leftValue={pickProb} leftColor="var(--accent)"
            rightLabel="Bookmakers" rightValue={Math.round(market * 10) / 10} rightColor="rgba(255,255,255,0.28)"
            max={Math.max(pickProb, market) * 1.15}
          />
          <Takeaway>
            {hasEdge && edge > 1 ? (
              <>We price <strong style={{ color: pickColor }}>{pickName}</strong> {edge.toFixed(1)} points higher than the market consensus{prob.marketProbs?.source ? ` (${prob.marketProbs.source})` : ''}. That gap is the value — when our number is right, the market is paying too much for the other side.</>
            ) : hasEdge && edge < -1 ? (
              <>The market is <em>more</em> confident than we are here ({Math.abs(edge).toFixed(1)} points). We still make {pickName} most likely — but there is no betting value at the current price, and we say so.</>
            ) : (
              <>Our number and the market's agree almost exactly. Fair price — no edge either way, and we won't pretend otherwise.</>
            )}
          </Takeaway>
        </Block>
      )}

      {/* 2 — Elo class gap (national teams) */}
      {ns && Number.isFinite(ns.homeElo) && (
        <Block icon={Zap} label="TEAM STRENGTH — WORLD FOOTBALL ELO">
          <DuelBar
            leftLabel={home} leftValue={ns.homeElo} leftColor={homeColor}
            rightLabel={away} rightValue={ns.awayElo} rightColor={awayColor}
            unit="" max={Math.max(ns.homeElo, ns.awayElo) * 1.06}
          />
          <Takeaway>
            <strong style={{ color: eloLeader === home ? homeColor : awayColor }}>{eloLeader}</strong> rates {eloGap} Elo points stronger
            {eloGap >= 250 ? ' — a different-class gap; upsets at this distance are rare.' : eloGap >= 120 ? ' — a clear but not unbridgeable advantage.' : ' — close on paper; form and matchday details decide games this tight.'}
            {ns.learned ? ' Ratings include every competitive international through this week, learned match by match.' : ''}
          </Takeaway>
        </Block>
      )}

      {/* 3 — Recent form, both sides */}
      {(hForm?.form || aForm?.form) && (
        <Block icon={TrendingUp} label={`RECENT FORM${hForm?.played ? ` — LAST ${Math.min(hForm.played, 10)}` : ''}`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[[home, hForm, homeColor], [away, aForm, awayColor]].map(([name, f, col], i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <FormChips form={f?.form} />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {winRate(f) != null && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Win rate <strong style={{ ...mono, color: 'var(--text-primary)' }}>{winRate(f)}%</strong></span>}
                  {f?.avgGoalsFor != null && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Scores <strong style={{ ...mono, color: 'var(--text-primary)' }}>{f.avgGoalsFor}</strong>/game</span>}
                  {f?.avgGoalsAgainst != null && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Concedes <strong style={{ ...mono, color: 'var(--text-primary)' }}>{f.avgGoalsAgainst}</strong></span>}
                  {f?.cleanSheets != null && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Clean sheets <strong style={{ ...mono, color: 'var(--text-primary)' }}>{f.cleanSheets}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* 4 — Head-to-head, only when real meetings exist */}
      {h2h?.totalMatches > 0 && (
        <Block icon={History} label={`HEAD-TO-HEAD — LAST ${h2h.totalMatches} MEETING${h2h.totalMatches > 1 ? 'S' : ''}`}>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
            {[[h2h.homeWins, homeColor], [h2h.draws, 'rgba(255,255,255,0.14)'], [h2h.awayWins, awayColor]].map(([n, col], i) => (
              <div key={i} style={{ width: `${Math.max(3, (n / h2h.totalMatches) * 100)}%`, background: col }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: homeColor, fontWeight: 600 }}>{home} {h2h.homeWins}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Draw {h2h.draws}</span>
            <span style={{ fontSize: 11, color: awayColor, fontWeight: 600 }}>{away} {h2h.awayWins}</span>
          </div>
          {h2h.matches?.[0] && (
            <Takeaway>
              Last meeting: {h2h.matches[0].home} <strong style={{ ...mono, color: 'var(--text-primary)' }}>{h2h.matches[0].homeGoals}–{h2h.matches[0].awayGoals}</strong> {h2h.matches[0].away}
              {h2h.matches[0].date ? ` (${new Date(h2h.matches[0].date).getFullYear()})` : ''}.
            </Takeaway>
          )}
        </Block>
      )}

      {/* 5 — The most likely path */}
      {(top || goalsLean) && (
        <Block icon={Target} label="HOW WE SEE IT PLAYING OUT">
          <Takeaway>
            {top && <>Most likely scoreline: <strong style={{ ...mono, color: 'var(--text-primary)' }}>{top.score}</strong> ({top.probability}% — no single scoreline is ever likely, so we price them all). </>}
            {goalsLean && <>Goals lean: <strong style={{ color: 'var(--text-primary)' }}>{goalsLean}</strong>.</>}
            {prob.expectedGoals?.home != null && <> Expected goals: {home} <strong style={{ ...mono, color: 'var(--text-primary)' }}>{prob.expectedGoals.home}</strong> · {away} <strong style={{ ...mono, color: 'var(--text-primary)' }}>{prob.expectedGoals.away}</strong>.</>}
          </Takeaway>
        </Block>
      )}

      {/* 6 — Full disclosure: how the number was built */}
      {(prob.modelProbs || conf) && (
        <Block icon={FlaskConical} label="HOW WE GOT HERE — FULL DISCLOSURE">
          <div style={{ ...mono, fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
            {prob.modelProbs?.[outcome] != null && prob.marketProbs?.[outcome] != null && Number.isFinite(prob.marketWeight) && (
              <div>
                Pure model {prob.modelProbs[outcome]}% · market {Math.round(prob.marketProbs[outcome] * 10) / 10}% · blend {Math.round(prob.marketWeight * 100)}% market → <strong style={{ color: 'var(--text-primary)' }}>{pickProb}%</strong>
              </div>
            )}
            {evidence && <div>Evidence base: {evidence.homeMatches ?? '?'} + {evidence.awayMatches ?? '?'} recent matches analysed</div>}
            {conf?.score != null && <div>Confidence {Math.round(conf.score)}% ({conf.tier}){prob.maturity?.label ? ` · ${prob.maturity.label}` : ''}</div>}
          </div>
          <Takeaway>
            We publish the ingredients, not just the verdict — and our error rate lives on the homepage. Trust us exactly as much as the track record earns.
          </Takeaway>
        </Block>
      )}
    </div>
  );
}
