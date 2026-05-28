import React from 'react';
import { safe, safeNum } from '../utils/safe.js';
import { getColor } from '../constants/teamColors.js';

const TABS = ['ANALYSIS', 'STATS', 'LINEUP', 'H2H', 'COMMENTARY'];

export function FixtureAnalysis({ fixture, analysis, liveStats, aiLoading, onSelectTeam }) {
  const [activeTab, setActiveTab] = React.useState('ANALYSIS');
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const homeColor = getColor(home?.name).primary;
  const awayColor = getColor(away?.name).primary;

  const isReady = !aiLoading && analysis && !analysis.error;
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';

  if (aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-on-surface">
        <div className="animate-pulse text-5xl mb-6">🧠</div>
        <h2 className="text-2xl font-black font-headline mb-2">TROY'S AI ANALYST</h2>
        <p className="text-on-surface-variant text-xs">Aggregating Poisson models, team form, and historical patterns...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-on-surface">
      {/* Match Header */}
      <div className="px-8 pt-8 pb-0 border-b border-outline-variant/10">
        <div className="flex justify-between items-center max-w-[800px] mx-auto pb-8">
          {/* Home */}
          <div className="flex-1 text-center cursor-pointer group" onClick={() => onSelectTeam(home.id)}>
            {home.crest && <img src={home.crest} alt="" className="w-16 h-16 mx-auto mb-3 object-contain" />}
            <div className="text-lg font-black font-headline group-hover:opacity-80 transition-opacity" style={{ color: homeColor }}>{home.name}</div>
            <div className="flex justify-center mt-2"><FormStrip form={analysis?.homeStats?.form} /></div>
          </div>

          {/* Score / Time */}
          <div className="w-40 text-center">
            <div className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-2">
              {fixture.league?.name}
            </div>
            <div className="text-4xl font-black font-headline tracking-tight">
              {fixture.status === 'SCHEDULED' ? (
                new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              ) : (
                `${fixture.score.home}-${fixture.score.away}`
              )}
            </div>
            {isLive && (
              <div className="flex items-center justify-center gap-1.5 mt-2 text-error text-[10px] font-black">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                {fixture.minute}'
              </div>
            )}
            {fixture.status === 'FINISHED' && (
              <div className="text-[10px] text-on-surface-variant/30 font-black mt-2">FT</div>
            )}
          </div>

          {/* Away */}
          <div className="flex-1 text-center cursor-pointer group" onClick={() => onSelectTeam(away.id)}>
            {away.crest && <img src={away.crest} alt="" className="w-16 h-16 mx-auto mb-3 object-contain" />}
            <div className="text-lg font-black font-headline group-hover:opacity-80 transition-opacity" style={{ color: awayColor }}>{away.name}</div>
            <div className="flex justify-center mt-2"><FormStrip form={analysis?.awayStats?.form} /></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 max-w-[800px] mx-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab 
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-on-surface-variant/30 hover:text-on-surface-variant/60 border-b-2 border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[800px] mx-auto">
          {activeTab === 'ANALYSIS' && <AnalysisSection analysis={analysis} home={home} away={away} />}
          {activeTab === 'STATS' && <StatsSection home={home} away={away} stats={liveStats} />}
          {activeTab === 'H2H' && <H2HSection h2h={analysis?.h2h} ai={analysis?.ai} home={home} away={away} />}
          {activeTab === 'LINEUP' && <LineupSection fixtureId={fixture.id} home={home} away={away} />}
          {activeTab === 'COMMENTARY' && <CommentarySection fixtureId={fixture.id} />}
        </div>
      </div>
    </div>
  );
}

function AnalysisSection({ analysis, home, away }) {
  const m = analysis?.markets || {};
  const ai = analysis?.ai || {};
  const hCol = getColor(home.name).primary;
  const aCol = getColor(away.name).primary;

  const radarData = [
    { label: 'Attack', value: safeNum(ai.attackRating, 70) },
    { label: 'Defence', value: safeNum(ai.defenceRating, 65) },
    { label: 'Form', value: safeNum(ai.formRating, 75) },
    { label: 'H2H', value: safeNum(ai.h2hRating, 60) },
    { label: 'Value', value: safeNum(ai.valueRating, 72) },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Win Probability Bar */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest mb-4">Win Probability</div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-bold" style={{ color: hCol }}>{m.result?.homeWin?.toFixed(0) || 33}%</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden bg-surface-container-highest flex">
            <div style={{ width: `${m.result?.homeWin || 33}%`, background: hCol }} className="transition-all rounded-l-full" />
            <div style={{ width: `${m.result?.draw || 33}%` }} className="bg-outline-variant/30 transition-all" />
            <div style={{ width: `${m.result?.awayWin || 33}%`, background: aCol }} className="transition-all rounded-r-full" />
          </div>
          <span className="text-xs font-bold" style={{ color: aCol }}>{m.result?.awayWin?.toFixed(0) || 33}%</span>
        </div>
        <div className="flex justify-between text-[9px] text-on-surface-variant/30 font-medium uppercase tracking-wider">
          <span>{home.name}</span>
          <span>Draw {m.result?.draw?.toFixed(0) || 34}%</span>
          <span>{away.name}</span>
        </div>
      </div>

      {/* Probability Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: home.name + ' Win', val: m.result?.homeWin || 33, col: hCol },
          { label: 'Draw', val: m.result?.draw || 34, col: '#717583' },
          { label: away.name + ' Win', val: m.result?.awayWin || 33, col: aCol },
          { label: 'Top Score', val: m.topScoreline?.prob || 10, score: m.topScoreline?.h !== undefined ? `${m.topScoreline.h}-${m.topScoreline.a}` : '1-1', col: '#22c55e' }
        ].map(c => (
          <div key={c.label} className="bg-surface-container rounded-xl border border-outline-variant/10 p-4">
            <div className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-2 truncate">{c.label}</div>
            <div className="text-2xl font-black font-headline" style={{ color: c.col }}>
              {c.score || `${c.val?.toFixed(0)}%`}
            </div>
            {c.score && <div className="text-[9px] text-on-surface-variant/30 mt-1">{c.val?.toFixed(0)}% PROB</div>}
          </div>
        ))}
      </div>

      {/* AI Analyst Verdict */}
      <div className="bg-surface-container rounded-2xl border border-primary/10 overflow-hidden">
        <div className="px-6 py-4 bg-primary/5 border-b border-primary/10 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>psychology</span>
          <span className="font-black text-xs text-primary uppercase tracking-[0.15em]">Neural Verdict</span>
        </div>
        <div className="grid grid-cols-[1.2fr_1fr]">
          <div className="p-6 border-r border-outline-variant/10">
            <p className="text-sm leading-relaxed text-on-surface/80 mb-5">{ai.verdict}</p>
            <div className="flex flex-col gap-3">
              {ai.keyFactors?.map((k, i) => (
                <div key={i} className="flex gap-3 text-xs text-on-surface-variant">
                  <span className="text-primary font-black">{i + 1}.</span>
                  <span>{k}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 bg-surface-container-low flex flex-col gap-5">
            <div>
              <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mb-1.5">Attack / Defence</div>
              <p className="text-xs text-on-surface-variant leading-relaxed">{ai.attackAnalysis} {ai.defenceAnalysis}</p>
            </div>
            <div>
              <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mb-1.5">Form Shift</div>
              <p className="text-xs text-on-surface-variant leading-relaxed">{ai.formAnalysis}</p>
            </div>
            <div className="mt-auto bg-surface-container p-4 rounded-xl border-l-[3px] border-l-primary">
              <div className="text-[9px] font-black text-primary uppercase mb-1">Recommendation</div>
              <div className="text-sm font-black text-on-surface">{ai.recommendation}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Markets Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="text-xs font-black uppercase tracking-[0.1em] mb-5">AI Categorised Markets by Risk</div>
        <RiskMarketsTable analysis={analysis} homeTeam={home} awayTeam={away} />
      </div>
    </div>
  );
}

function StatsSection({ home, away, stats }) {
  if (!stats || !stats.length) return (
    <div className="text-center py-24 text-on-surface-variant/30">
      <span className="material-symbols-outlined text-4xl mb-3 block">bar_chart</span>
      Live stats unavailable for this match.
    </div>
  );

  const hCol = getColor(home.name).primary;
  const aCol = getColor(away.name).primary;

  return (
    <div className="flex flex-col gap-5">
      {stats.map(s => {
        const h = parseFloat(s.home) || 0;
        const a = parseFloat(s.away) || 0;
        const total = h + a || 1;
        const hp = (h / total) * 100;
        const ap = (a / total) * 100;

        return (
          <div key={s.type} className="py-1">
            <div className="flex justify-between mb-2 text-sm font-bold">
              <span style={{ color: hCol }}>{s.home}</span>
              <span className="text-[10px] text-on-surface-variant/40 uppercase tracking-widest">{s.type}</span>
              <span style={{ color: aCol }}>{s.away}</span>
            </div>
            <div className="h-1.5 bg-surface-container-highest rounded-full flex overflow-hidden">
              <div style={{ width: `${hp}%`, background: hCol }} className="transition-all duration-500" />
              <div style={{ width: `${ap}%`, background: aCol }} className="transition-all duration-500" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function H2HSection({ h2h, ai, home, away }) {
  if (!h2h) return null;
  const hCol = getColor(home.name).primary;
  const aCol = getColor(away.name).primary;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4 bg-surface-container p-6 rounded-2xl text-center border border-outline-variant/10">
        <div>
          <div className="text-3xl font-black font-headline" style={{ color: hCol }}>{h2h.homeWins}</div>
          <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mt-1">{home.name}</div>
        </div>
        <div>
          <div className="text-3xl font-black font-headline text-outline">{h2h.draws}</div>
          <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mt-1">Draws</div>
        </div>
        <div>
          <div className="text-3xl font-black font-headline" style={{ color: aCol }}>{h2h.awayWins}</div>
          <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mt-1">{away.name}</div>
        </div>
      </div>

      {ai?.h2hAnalysis && (
        <div className="text-sm text-on-surface-variant/60 italic leading-relaxed bg-surface-container p-5 rounded-xl border-l-2 border-primary/20">
          {ai.h2hAnalysis}
        </div>
      )}

      <div className="flex flex-col rounded-xl overflow-hidden border border-outline-variant/10">
        {h2h.last5?.map((m, i) => (
          <div key={i} className="flex items-center px-5 py-3 bg-surface-container border-b border-surface last:border-b-0">
            <div className="w-14 text-[10px] text-on-surface-variant/30 font-bold">{new Date(m.date).getFullYear()}</div>
            <div className="flex-1 text-right text-sm font-semibold">{m.home}</div>
            <div className="w-14 text-center font-black text-sm">{m.goals.home}-{m.goals.away}</div>
            <div className="flex-1 text-left text-sm font-semibold">{m.away}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupSection({ home, away }) {
  return (
    <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
      <div className="w-full max-w-[400px] mx-auto h-[500px] border-2 border-secondary/10 rounded-lg relative"
        style={{ background: 'radial-gradient(circle, rgba(47,248,1,0.03) 0%, rgba(9,14,25,1) 100%)' }}>
        <div className="absolute top-1/2 left-0 right-0 h-px bg-secondary/10" />
        <div className="absolute top-1/2 left-1/2 w-20 h-20 border border-secondary/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{ background: getColor(home.name).primary }} />
        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{ background: getColor(away.name).primary }} />
      </div>
      <div className="mt-6 text-xs text-on-surface-variant/30 font-bold uppercase tracking-widest">Tactical Lineup Data Active</div>
    </div>
  );
}

function CommentarySection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="p-6 bg-surface-container rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <div className="text-[10px] font-black text-secondary uppercase tracking-widest">Live Narrative Engine Active</div>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
          Connecting to real-time streams. Tactically-aware play-by-play commentary will appear here once the match begins.
        </p>
        <div className="flex flex-col gap-3 opacity-20 select-none">
          <div className="h-4 bg-outline-variant/10 rounded w-3/4" />
          <div className="h-4 bg-outline-variant/10 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

function RiskMarketsTable({ analysis, homeTeam, awayTeam }) {
  const { lowRiskBets, midRiskBets, highRiskBets } = analysis?.ai || {};

  // Display old static matrix if no AI arrays exist
  if (!lowRiskBets && !midRiskBets && !highRiskBets) {
     const markets = analysis?.markets;
     if (!markets) return null;
     const rows = [
       { name: homeTeam?.name + ' Win', prob: markets.result?.homeWin, risk: { color: 'text-tertiary', bg: 'bg-tertiary/10', label: 'MEDIUM' } },
       { name: 'Over 2.5 Goals', prob: markets.goals?.over25, risk: { color: 'text-tertiary', bg: 'bg-tertiary/10', label: 'MEDIUM' } },
     ];
     return <div className="text-on-surface-variant text-sm italic">AI Risk Categorisation unavailable. Complete analysis still processing.</div>
  }

  const sections = [
    { title: 'Low Risk', items: lowRiskBets || [], color: 'text-secondary', bg: 'bg-secondary/10' },
    { title: 'Medium Risk', items: midRiskBets || [], color: 'text-tertiary', bg: 'bg-tertiary/10' },
    { title: 'High Risk', items: highRiskBets || [], color: 'text-error', bg: 'bg-error/10' }
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map(sec => sec.items.length > 0 && (
        <div key={sec.title}>
          <div className={`text-[10px] font-black uppercase tracking-wider mb-3 px-2 py-1 rounded inline-block ${sec.color} ${sec.bg}`}>
            {sec.title}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {sec.items.map((r, i) => (
                <tr key={i} className="border-b border-outline-variant/5 hover:bg-white/[0.02] transition-colors group">
                  <td className="py-3 px-2 font-black text-on-surface w-1/3">{r.market}</td>
                  <td className="py-3 px-2 text-on-surface-variant group-hover:text-on-surface transition-colors">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function FormStrip({ form }) {
  if (!form) return null;
  const chars = String(form).split('').slice(-5);
  return (
    <div className="flex gap-1">
      {chars.map((char, i) => (
        <div key={i} className={`w-4 h-4 rounded text-[7px] font-black flex items-center justify-center text-white ${
          char === 'W' ? 'bg-secondary' : char === 'L' ? 'bg-error' : 'bg-outline'
        }`}>
          {char}
        </div>
      ))}
    </div>
  );
}
