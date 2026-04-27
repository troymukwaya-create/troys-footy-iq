import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { safe, safeNum } from '../utils/safe.js';
import { getColor } from '../constants/teamColors.js';

const TABS = ['MATCHES', 'TABLE', 'TOP SCORERS', 'TEAMS', 'HISTORY'];

const LEAGUE_HISTORY = {
  'PL': [
    { season: '2024/25', winner: 'Liverpool', runnerUp: 'Arsenal', scorer: 'Mohamed Salah (29)' },
    { season: '2023/24', winner: 'Manchester City', runnerUp: 'Arsenal', scorer: 'Erling Haaland (27)' },
    { season: '2022/23', winner: 'Manchester City', runnerUp: 'Arsenal', scorer: 'Erling Haaland (36)' },
    { season: '2021/22', winner: 'Manchester City', runnerUp: 'Liverpool', scorer: 'Son Heung-min (23)' },
    { season: '2020/21', winner: 'Manchester City', runnerUp: 'Manchester United', scorer: 'Harry Kane (23)' },
    { season: '2019/20', winner: 'Liverpool', runnerUp: 'Manchester City', scorer: 'Jamie Vardy (23)' },
    { season: '2018/19', winner: 'Manchester City', runnerUp: 'Liverpool', scorer: 'Mohamed Salah (22)' },
    { season: '2017/18', winner: 'Manchester City', runnerUp: 'Manchester United', scorer: 'Mohamed Salah (32)' },
  ],
  'PD': [
    { season: '2024/25', winner: 'Barcelona', runnerUp: 'Real Madrid', scorer: 'Robert Lewandowski (27)' },
    { season: '2023/24', winner: 'Real Madrid', runnerUp: 'Barcelona', scorer: 'Artem Dovbyk (24)' },
    { season: '2022/23', winner: 'Barcelona', runnerUp: 'Real Madrid', scorer: 'Robert Lewandowski (23)' },
    { season: '2021/22', winner: 'Real Madrid', runnerUp: 'Barcelona', scorer: 'Karim Benzema (27)' },
    { season: '2020/21', winner: 'Atletico Madrid', runnerUp: 'Real Madrid', scorer: 'Lionel Messi (30)' },
    { season: '2019/20', winner: 'Real Madrid', runnerUp: 'Barcelona', scorer: 'Lionel Messi (25)' },
    { season: '2018/19', winner: 'Barcelona', runnerUp: 'Atletico Madrid', scorer: 'Lionel Messi (36)' },
    { season: '2017/18', winner: 'Barcelona', runnerUp: 'Atletico Madrid', scorer: 'Lionel Messi (34)' },
  ],
  'BL1': [
    { season: '2024/25', winner: 'Bayer Leverkusen', runnerUp: 'Bayern Munich', scorer: 'Harry Kane (25)' },
    { season: '2023/24', winner: 'Bayer Leverkusen', runnerUp: 'Stuttgart', scorer: 'Harry Kane (36)' },
    { season: '2022/23', winner: 'Bayern Munich', runnerUp: 'Borussia Dortmund', scorer: 'Niclas Fullkrug (16)' },
    { season: '2021/22', winner: 'Bayern Munich', runnerUp: 'Borussia Dortmund', scorer: 'Robert Lewandowski (35)' },
    { season: '2020/21', winner: 'Bayern Munich', runnerUp: 'RB Leipzig', scorer: 'Robert Lewandowski (41)' },
    { season: '2019/20', winner: 'Bayern Munich', runnerUp: 'Borussia Dortmund', scorer: 'Robert Lewandowski (34)' },
    { season: '2018/19', winner: 'Bayern Munich', runnerUp: 'Borussia Dortmund', scorer: 'Robert Lewandowski (22)' },
    { season: '2017/18', winner: 'Bayern Munich', runnerUp: 'Schalke', scorer: 'Robert Lewandowski (29)' },
  ],
  'SA': [
    { season: '2024/25', winner: 'Inter Milan', runnerUp: 'Napoli', scorer: 'Mateo Retegui (24)' },
    { season: '2023/24', winner: 'Inter Milan', runnerUp: 'AC Milan', scorer: 'Lautaro Martinez (24)' },
    { season: '2022/23', winner: 'Napoli', runnerUp: 'Lazio', scorer: 'Victor Osimhen (26)' },
    { season: '2021/22', winner: 'AC Milan', runnerUp: 'Inter Milan', scorer: 'Ciro Immobile (27)' },
    { season: '2020/21', winner: 'Inter Milan', runnerUp: 'AC Milan', scorer: 'Cristiano Ronaldo (29)' },
    { season: '2019/20', winner: 'Juventus', runnerUp: 'Inter Milan', scorer: 'Ciro Immobile (36)' },
    { season: '2018/19', winner: 'Juventus', runnerUp: 'Napoli', scorer: 'Fabio Quagliarella (26)' },
    { season: '2017/18', winner: 'Juventus', runnerUp: 'Napoli', scorer: 'Mauro Icardi (29)' },
  ],
  'FL1': [
    { season: '2024/25', winner: 'PSG', runnerUp: 'Monaco', scorer: 'Jonathan David (25)' },
    { season: '2023/24', winner: 'PSG', runnerUp: 'Monaco', scorer: 'Kylian Mbappe (27)' },
    { season: '2022/23', winner: 'PSG', runnerUp: 'Marseille', scorer: 'Kylian Mbappe (29)' },
    { season: '2021/22', winner: 'PSG', runnerUp: 'Marseille', scorer: 'Kylian Mbappe (28)' },
    { season: '2020/21', winner: 'Lille', runnerUp: 'PSG', scorer: 'Kylian Mbappe (27)' },
    { season: '2019/20', winner: 'PSG', runnerUp: 'Marseille', scorer: 'Wissam Ben Yedder (18)' },
    { season: '2018/19', winner: 'PSG', runnerUp: 'Lille', scorer: 'Kylian Mbappe (33)' },
    { season: '2017/18', winner: 'PSG', runnerUp: 'Monaco', scorer: 'Edinson Cavani (28)' },
  ],
  'BSA': [
    { season: '2024', winner: 'Botafogo', runnerUp: 'Palmeiras', scorer: 'Eduardo Sasha (14)' },
    { season: '2023', winner: 'Atletico Mineiro', runnerUp: 'Gremio', scorer: 'Guilherme Madruga (16)' },
    { season: '2022', winner: 'Palmeiras', runnerUp: 'Internacional', scorer: 'Cano (26)' },
    { season: '2021', winner: 'Atletico Mineiro', runnerUp: 'Flamengo', scorer: 'Hulk (19)' },
    { season: '2020', winner: 'Flamengo', runnerUp: 'Internacional', scorer: 'Gabigol (27)' },
    { season: '2019', winner: 'Flamengo', runnerUp: 'Palmeiras', scorer: 'Gabigol (25)' },
    { season: '2018', winner: 'Palmeiras', runnerUp: 'Internacional', scorer: 'Gabriel Barbosa (18)' },
    { season: '2017', winner: 'Corinthians', runnerUp: 'Santos', scorer: 'Roger (18)' },
  ],
  'CL': [
    { season: '2024/25', winner: 'PSG', runnerUp: 'Arsenal', scorer: 'Ongoing' },
    { season: '2023/24', winner: 'Real Madrid', runnerUp: 'Borussia Dortmund', scorer: 'Vinicius Jr (6)' },
    { season: '2022/23', winner: 'Manchester City', runnerUp: 'Inter Milan', scorer: 'Erling Haaland (12)' },
    { season: '2021/22', winner: 'Real Madrid', runnerUp: 'Liverpool', scorer: 'Benzema (15)' },
    { season: '2020/21', winner: 'Chelsea', runnerUp: 'Manchester City', scorer: 'Erling Haaland (10)' },
    { season: '2019/20', winner: 'Bayern Munich', runnerUp: 'PSG', scorer: 'Robert Lewandowski (15)' },
    { season: '2018/19', winner: 'Liverpool', runnerUp: 'Tottenham', scorer: 'Lionel Messi (12)' },
    { season: '2017/18', winner: 'Real Madrid', runnerUp: 'Liverpool', scorer: 'Cristiano Ronaldo (15)' },
  ],
};

const TAB_ICONS = {
  'MATCHES': 'calendar_today',
  'TABLE': 'leaderboard',
  'TOP SCORERS': 'sports_soccer',
  'TEAMS': 'groups',
  'HISTORY': 'trophy'
};

export function LeagueHub({ leagueCode, allFixtures, onSelectFixture, onSelectTeam }) {
  const [activeTab, setActiveTab] = useState('MATCHES');
  const [standings, setStandings] = useState(null);
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);

  const leagueName = allFixtures.find(f => f.league?.code === leagueCode)?.league?.name || leagueCode;
  const leagueLogo = allFixtures.find(f => f.league?.code === leagueCode)?.league?.logo;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [standRes, scorRes] = await Promise.all([
          axios.get(`/api/fixtures/standings/${leagueCode}`),
          axios.get(`/api/fixtures/scorers/${leagueCode}`)
        ]);
        setStandings(standRes.data || null);
        setScorers(scorRes.data || []);
      } catch (err) {
        console.error('Failed to fetch league data', err);
      }
      setLoading(false);
    }
    fetchData();
  }, [leagueCode]);

  const leagueFixtures = allFixtures.filter(f => f.league?.code === leagueCode);

  return (
    <div className="flex flex-col h-full text-on-surface">
      {/* League Header */}
      <div className="px-8 pt-8 pb-0 border-b border-outline-variant/10">
        <div className="flex items-center gap-6 mb-8">
          {leagueLogo ? (
            <img src={leagueLogo} alt="" className="w-16 h-16 object-contain" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/30" style={{fontVariationSettings: "'FILL' 1"}}>trophy</span>
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black font-headline">{leagueName}</h1>
            <div className="text-xs text-on-surface-variant/40 mt-1 font-bold uppercase tracking-widest">
              2024/25 Season • Analyst Data Active
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-8">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant/30 hover:text-on-surface-variant/60 border-b-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{TAB_ICONS[tab]}</span>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="py-24 text-center text-on-surface-variant/30">
            <div className="text-4xl animate-spin mb-4">⚽</div>
            Analysing league data...
          </div>
        ) : (
          <div className="max-w-[800px] mx-auto">
            {activeTab === 'MATCHES' && <MatchesTab filtered={leagueFixtures} onSelect={onSelectFixture} onSelectTeam={onSelectTeam} />}
            {activeTab === 'TABLE' && <TableTab standings={standings} onSelectTeam={onSelectTeam} />}
            {activeTab === 'TOP SCORERS' && <ScorersTab scorers={scorers} onSelectTeam={onSelectTeam} />}
            {activeTab === 'TEAMS' && <TeamsTab standings={standings} onSelectTeam={onSelectTeam} />}
            {activeTab === 'HISTORY' && <HistoryTab history={LEAGUE_HISTORY[leagueCode] || []} />}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchesTab({ filtered, onSelect, onSelectTeam }) {
  const groups = {};
  filtered.forEach(f => {
    const d = new Date(f.date);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    let label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }).toUpperCase();
    if (d.toDateString() === today.toDateString()) label = 'TODAY';
    else if (d.toDateString() === yesterday.toDateString()) label = 'YESTERDAY';
    else if (d.toDateString() === tomorrow.toDateString()) label = 'TOMORROW';

    if (!groups[label]) groups[label] = [];
    groups[label].push(f);
  });

  const sortedLabels = Object.keys(groups).sort((a, b) => {
    if (a === 'YESTERDAY') return -1;
    if (a === 'TODAY') return (b === 'YESTERDAY' ? 1 : -1);
    if (a === 'TOMORROW') return (b === 'YESTERDAY' || b === 'TODAY' ? 1 : -1);
    return 0;
  });

  const getFullTeamId = (id) => {
    if (!id) return '';
    if (String(id).startsWith('apf_t_') || String(id).startsWith('fd_t_')) return id;
    return 'apf_t_' + id;
  };

  return (
    <div className="flex flex-col gap-8">
      {sortedLabels.map(label => (
        <div key={label}>
          <div className="text-[10px] font-black text-on-surface-variant/30 mb-4 tracking-widest">{label}</div>
          <div className="flex flex-col gap-0.5">
            {groups[label].sort((a, b) => new Date(a.date) - new Date(b.date)).map(f => (
              <div
                key={f.id}
                onClick={() => onSelect(f)}
                className="bg-surface-container p-3 flex items-center cursor-pointer rounded-lg hover:bg-surface-container-high transition-colors"
              >
                <div className={`w-14 text-[10px] font-bold ${
                  f.status === 'IN_PLAY' ? 'text-error' : 'text-on-surface-variant/30'
                }`}>
                  {f.status === 'IN_PLAY' ? (
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-error animate-pulse" />
                      {f.minute || '·'}'
                    </div>
                  ) : f.status === 'FINISHED' ? 'FT' : new Date(f.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex-1 flex items-center justify-center gap-3">
                  <div
                    onClick={(e) => { e.stopPropagation(); onSelectTeam(getFullTeamId(f.homeTeam.id)); }}
                    className="flex-1 text-right text-xs font-semibold cursor-pointer hover:text-primary transition-colors"
                  >{f.homeTeam.name}</div>
                  {f.homeTeam.crest && <img src={f.homeTeam.crest} alt="" className="w-5 h-5 object-contain" />}
                  <div className={`bg-surface-container-highest px-3 py-1 rounded min-w-[50px] text-center font-black text-sm ${
                    f.status === 'IN_PLAY' ? 'text-error' : 'text-on-surface'
                  }`}>
                    {f.status === 'SCHEDULED' ? '-' : `${f.score?.home || 0}-${f.score?.away || 0}`}
                  </div>
                  {f.awayTeam.crest && <img src={f.awayTeam.crest} alt="" className="w-5 h-5 object-contain" />}
                  <div
                    onClick={(e) => { e.stopPropagation(); onSelectTeam(getFullTeamId(f.awayTeam.id)); }}
                    className="flex-1 text-left text-xs font-semibold cursor-pointer hover:text-primary transition-colors"
                  >{f.awayTeam.name}</div>
                </div>
                <div className="w-8 text-right text-[10px] text-on-surface-variant/20">›</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableTab({ standings, onSelectTeam }) {
  if (!standings) return <div className="text-center py-10 text-on-surface-variant/30">Loading standings...</div>;
  const table = standings.league?.standings?.[0] || [];

  const getFullTeamId = (id) => {
    if (!id) return '';
    if (String(id).startsWith('apf_t_') || String(id).startsWith('fd_t_')) return id;
    return 'apf_t_' + id;
  };

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-container-low text-on-surface-variant/30 text-[9px] font-black uppercase tracking-widest">
            <th className="py-4 px-4 text-left w-10">#</th>
            <th className="py-4 px-4 text-left">Team</th>
            <th className="py-4 px-2 text-center">P</th>
            <th className="py-4 px-2 text-center">W</th>
            <th className="py-4 px-2 text-center">D</th>
            <th className="py-4 px-2 text-center">L</th>
            <th className="py-4 px-2 text-center">GF</th>
            <th className="py-4 px-2 text-center">GA</th>
            <th className="py-4 px-2 text-center">GD</th>
            <th className="py-4 px-4 text-center">PTS</th>
            <th className="py-4 px-4 text-left">Form</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => {
            const pos = row.rank || row.position;
            const isCL = pos <= 4;
            const isEL = pos === 5 || pos === 6;
            const isRel = pos >= table.length - 2;
            
            return (
              <tr key={i} className={`border-b border-outline-variant/5 hover:bg-white/[0.02] transition-colors ${
                i % 2 === 0 ? '' : 'bg-surface-container-low/30'
              }`}>
                <td className="py-3 px-4 font-black text-on-surface-variant/30 relative">
                  {isCL && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#3B82F6]" />}
                  {isEL && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-tertiary" />}
                  {isRel && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-error" />}
                  {pos}
                </td>
                <td className="py-3 px-4">
                  <div 
                    onClick={() => onSelectTeam(getFullTeamId(row.team.id))}
                    className="flex items-center gap-3 cursor-pointer hover:text-primary transition-colors"
                  >
                    {row.team.logo && <img src={row.team.logo} alt="" className="w-5 h-5 object-contain" />}
                    <span className="font-semibold">{row.team.name}</span>
                  </div>
                </td>
                <td className="py-3 px-2 text-center text-on-surface-variant/50">{row.all?.played || row.playedGames}</td>
                <td className="py-3 px-2 text-center">{row.all?.win || row.won}</td>
                <td className="py-3 px-2 text-center">{row.all?.draw || row.draw}</td>
                <td className="py-3 px-2 text-center">{row.all?.lose || row.lost}</td>
                <td className="py-3 px-2 text-center text-on-surface-variant/40">{row.all?.goals?.for || row.goalsFor}</td>
                <td className="py-3 px-2 text-center text-on-surface-variant/40">{row.all?.goals?.against || row.goalsAgainst}</td>
                <td className={`py-3 px-2 text-center font-semibold ${row.goalsDiff > 0 ? 'text-secondary' : 'text-error'}`}>
                  {row.goalsDiff > 0 ? '+' : ''}{row.goalsDiff}
                </td>
                <td className="py-3 px-4 text-center font-black text-sm">{row.points}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-1">
                    {(row.form || '').split('').map((char, j) => (
                      <div key={j} className={`w-4 h-4 rounded text-[7px] font-black flex items-center justify-center text-white ${
                        char === 'W' ? 'bg-secondary' : char === 'L' ? 'bg-error' : 'bg-outline'
                      }`}>{char}</div>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScorersTab({ scorers, onSelectTeam }) {
  const getFullTeamId = (id) => {
    if (!id) return '';
    if (String(id).startsWith('apf_t_') || String(id).startsWith('fd_t_')) return id;
    return 'apf_t_' + id;
  };

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-container-low text-on-surface-variant/30 text-[9px] font-black uppercase tracking-widest">
            <th className="py-4 px-4 text-left w-10">#</th>
            <th className="py-4 px-4 text-left">Player</th>
            <th className="py-4 px-4 text-left">Team</th>
            <th className="py-4 px-4 text-center">Goals</th>
            <th className="py-4 px-4 text-center">Assists</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map((s, i) => (
            <tr key={i} className="border-b border-outline-variant/5 hover:bg-white/[0.02] transition-colors">
              <td className={`py-3 px-4 font-black ${i === 0 ? 'text-tertiary' : 'text-on-surface-variant/30'}`}>{i + 1}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden">
                    <img src={s.player.photo} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-semibold">{s.player.name}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-on-surface-variant">
                <span 
                  onClick={() => onSelectTeam(getFullTeamId(s.statistics[0].team.id))}
                  className="cursor-pointer hover:text-primary transition-colors"
                >{s.statistics[0].team.name}</span>
              </td>
              <td className="py-3 px-4 text-center font-black text-secondary text-sm">{s.statistics[0].goals.total}</td>
              <td className="py-3 px-4 text-center font-semibold text-on-surface-variant">{s.statistics[0].goals.assists || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTab({ standings, onSelectTeam }) {
  const table = safe(() => standings.league.standings[0], []);

  const getFullTeamId = (id) => {
    if (!id) return '';
    if (String(id).startsWith('apf_t_') || String(id).startsWith('fd_t_')) return id;
    return 'apf_t_' + id;
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {table.map((row, i) => (
        <div
          key={i}
          onClick={() => onSelectTeam(getFullTeamId(row.team.id))}
          className="bg-surface-container p-5 rounded-xl text-center border border-outline-variant/10 cursor-pointer hover:border-outline-variant/20 hover:-translate-y-0.5 transition-all"
        >
          {row.team.logo && <img src={row.team.logo} alt="" className="w-12 h-12 mx-auto mb-3 object-contain" />}
          <div className="font-semibold text-xs mb-1">{row.team.name}</div>
          <div className="text-[9px] text-on-surface-variant/30 font-bold uppercase">POS: {row.rank}</div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ history }) {
  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="bg-surface-container-low text-on-surface-variant/30 text-[9px] font-black uppercase tracking-widest">
            <th className="py-4 px-6">Season</th>
            <th className="py-4 px-6">Winner</th>
            <th className="py-4 px-6">Runner Up</th>
            <th className="py-4 px-6">Top Scorer</th>
          </tr>
        </thead>
        <tbody>
          {(history || []).map((h, i) => (
            <tr key={i} className="border-b border-outline-variant/5">
              <td className="py-4 px-6 font-semibold text-on-surface-variant/40">{h.season}</td>
              <td className="py-4 px-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-tertiary text-sm" style={{fontVariationSettings: "'FILL' 1"}}>trophy</span>
                  <span className="font-bold">{h.winner}</span>
                </div>
              </td>
              <td className="py-4 px-6 text-on-surface-variant">{h.runnerUp}</td>
              <td className="py-4 px-6 font-semibold text-secondary">{h.scorer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
