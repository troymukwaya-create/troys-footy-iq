import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import LeagueTable from '../components/LeagueTable';
import LiveScoreCard from '../components/LiveScoreCard';

export default function LeaguePage() {
  const { code } = useParams();
  const [standings, setStandings] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [std, scr, upc, past] = await Promise.all([
          api.get(`/leagues/${code}/standings`).catch(()=>({data:[]})),
          api.get(`/leagues/${code}/scorers`).catch(()=>({data:[]})),
          api.get(`/leagues/${code}/fixtures?date=upcoming`).catch(()=>({data:[]})),
          api.get(`/leagues/${code}/fixtures?date=past`).catch(()=>({data:[]}))
        ]);
        setStandings(std.data || []);
        setScorers(scr.data || []);
        setFixtures({ upcoming: upc.data || [], past: past.data || [] });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch();
  }, [code]);

  if (loading) return <div className="text-gray-400 animate-pulse text-lg p-8">Loading league data...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-gray-800 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">{code}</h1>
          <p className="text-xl text-emerald-500 font-medium mt-1">Current Season</p>
        </div>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
           <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-800 text-center">
              <div className="text-xs text-gray-500 uppercase font-bold">Matches</div>
              <div className="text-lg font-bold">{standings[0]?.playedGames * standings.length / 2 || 0}</div>
           </div>
           <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-800 text-center">
              <div className="text-xs text-gray-500 uppercase font-bold">Teams</div>
              <div className="text-lg font-bold">{standings.length || 0}</div>
           </div>
        </div>
      </div>
      
      <div className="grid xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-2xl font-semibold mb-2 text-gray-200">Table</h2>
          <LeagueTable standings={standings} />
        </div>
        
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-200">Top Scorers</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4 shadow-sm">
              {scorers.length > 0 ? scorers.map((s, i) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-800/50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <span className={`font-bold w-5 text-center ${i < 3 ? 'text-amber-400' : 'text-gray-600'}`}>{i + 1}</span>
                    <div>
                      <div className="font-bold text-sm text-gray-200">{s.player?.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.team?.name}</div>
                    </div>
                  </div>
                  <div className="font-extrabold text-xl text-emerald-400">{s.goals} <span className="text-xs text-gray-500 font-normal">G</span></div>
                </div>
              )) : <div className="text-sm text-gray-500 italic">No scorer data available to display.</div>}
            </div>
          </div>
          
          <div>
            <div className="flex gap-4 border-b border-gray-800 mb-6">
               <button onClick={() => setActiveTab('upcoming')} className={`pb-2 text-sm font-bold uppercase tracking-widest ${activeTab === 'upcoming' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>Upcoming</button>
               <button onClick={() => setActiveTab('past')} className={`pb-2 text-sm font-bold uppercase tracking-widest ${activeTab === 'past' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>Results</button>
            </div>
            <div className="space-y-3">
              {(fixtures[activeTab] || []).length > 0 ? (
                (fixtures[activeTab] || []).slice(0, 10).map(f => <LiveScoreCard key={f.id} match={f} />)
              ) : (
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center text-gray-500 italic text-sm shadow-sm">
                   No {activeTab} matches found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
