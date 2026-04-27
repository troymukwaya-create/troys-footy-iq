import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getColor } from '../constants/teamColors.js';

const TABS = ['FIXTURES', 'SQUAD', 'STATS', 'H2H'];

export function TeamPage({ teamId, onSelectFixture }) {
  const [activeTab, setActiveTab] = useState('FIXTURES');
  const [team, setTeam] = useState(null);
  const [squad, setSquad] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [teamRes, squadRes, fixRes] = await Promise.all([
          axios.get(`/api/fixtures/team/${teamId}`),
          axios.get(`/api/fixtures/squad/${teamId}`),
          axios.get(`/api/fixtures/team-fixtures/${teamId}`)
        ]);
        setTeam(teamRes.data);
        setSquad(squadRes.data || []);
        setFixtures(fixRes.data || []);
      } catch (err) {
        console.error('Failed to fetch team data', err);
      }
      setLoading(false);
    }
    fetchData();
  }, [teamId]);

  if (loading) return <div className="py-24 text-center text-on-surface-variant/30 text-xs">Loading team data...</div>;
  if (!team) return <div className="py-24 text-center text-on-surface-variant/30 text-xs">Team not found.</div>;

  const teamColor = getColor(team.name).primary;

  return (
    <div className="flex flex-col h-full text-on-surface">
      <div className="px-8 pt-10 pb-0 border-b border-outline-variant/10"
        style={{ background: `linear-gradient(180deg, ${teamColor}0d 0%, transparent 100%)` }}>
        <div className="flex items-center gap-8 max-w-[800px] mx-auto pb-8">
          {team.logo && <img src={team.logo} alt="" className="w-20 h-20 object-contain" />}
          <div>
            <h1 className="text-3xl font-black font-headline">{team.name}</h1>
            <div className="text-xs text-on-surface-variant/40 mt-1 font-bold uppercase tracking-widest">
              {team.venue} • {team.country}
            </div>
          </div>
        </div>

        <div className="flex gap-6 max-w-[800px] mx-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? 'text-on-surface border-b-2'
                  : 'text-on-surface-variant/30 hover:text-on-surface-variant/60 border-b-2 border-transparent'
              }`}
              style={activeTab === tab ? { borderBottomColor: teamColor } : {}}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[800px] mx-auto">
          {activeTab === 'FIXTURES' && <TeamFixtures fixtures={fixtures} onSelect={onSelectFixture} />}
          {activeTab === 'SQUAD' && <TeamSquad squad={squad} />}
          {activeTab === 'STATS' && <TeamStats teamId={teamId} />}
          {activeTab === 'H2H' && <div className="text-on-surface-variant/30 text-center py-10 text-xs">Select another team to see H2H.</div>}
        </div>
      </div>
    </div>
  );
}

function TeamFixtures({ fixtures, onSelect }) {
  return (
    <div className="flex flex-col gap-0.5">
      {fixtures.sort((a, b) => new Date(b.date) - new Date(a.date)).map(f => (
        <div
          key={f.id}
          onClick={() => onSelect(f)}
          className="bg-surface-container p-3 flex items-center cursor-pointer border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors"
        >
          <div className="w-20 text-[10px] font-semibold text-on-surface-variant/40">
            {new Date(f.date).toLocaleDateString([], { day: 'numeric', month: 'short' })}
          </div>
          <div className="flex-1 flex items-center gap-3">
            {f.homeTeam.crest && <img src={f.homeTeam.crest} alt="" className="w-4 h-4" />}
            <span className="font-semibold text-xs">{f.homeTeam.name}</span>
            <span className="font-black text-sm mx-2">{f.score.home}-{f.score.away}</span>
            <span className="font-semibold text-xs">{f.awayTeam.name}</span>
            {f.awayTeam.crest && <img src={f.awayTeam.crest} alt="" className="w-4 h-4" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamSquad({ squad }) {
  const groups = {
    'Goalkeeper': [],
    'Defender': [],
    'Midfielder': [],
    'Attacker': []
  };
  squad.forEach(p => {
    if (groups[p.position]) groups[p.position].push(p);
  });

  return (
    <div className="flex flex-col gap-10">
      {Object.entries(groups).map(([pos, players]) => (
        <div key={pos}>
          <div className="text-[10px] font-black text-on-surface-variant/30 uppercase tracking-widest mb-4">{pos}S</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {players.map(p => (
              <div key={p.id} className="bg-surface-container p-3 rounded-lg flex items-center gap-3">
                <span className="text-sm font-black text-on-surface-variant/20 w-6">{p.number || '•'}</span>
                <span className="font-semibold text-xs">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamStats({ teamId }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: 'Avg Goals', val: '2.4', color: 'text-secondary' },
        { label: 'Clean Sheets', val: '12', color: 'text-primary' },
        { label: 'Avg Possession', val: '58%', color: 'text-tertiary' },
        { label: 'Cards (Avg)', val: '1.8', color: 'text-error' }
      ].map(s => (
        <div key={s.label} className="bg-surface-container p-6 rounded-xl text-center border border-outline-variant/10">
          <div className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-wider mb-2">{s.label}</div>
          <div className={`text-2xl font-black font-headline ${s.color}`}>{s.val}</div>
        </div>
      ))}
    </div>
  );
}
