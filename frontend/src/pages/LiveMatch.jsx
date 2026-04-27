import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import WinProbBar from '../components/WinProbBar';

export default function LiveMatch() {
  const { fixtureId } = useParams();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/fixtures/${fixtureId}`);
        setMatch(res.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch();
    const int = setInterval(fetch, 30000);
    return () => clearInterval(int);
  }, [fixtureId]);

  if (loading) return <div className="p-8 text-gray-400 animate-pulse text-lg flex justify-center mt-20">Loading match center...</div>;
  if (!match) return <div className="p-8 text-red-500 font-bold flex justify-center mt-20">Fixture not found.</div>;

  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';

  const timeline = [
    { min: 12, type: 'Goal', team: match.homeTeam?.name, player: 'Striker A', detail: 'Assist by Midfielder B' },
    { min: 34, type: 'Yellow Card', team: match.awayTeam?.name, player: 'Defender C', detail: 'Foul' },
    { min: 67, type: 'Substitution', team: match.homeTeam?.name, player: 'Sub In', detail: 'Sub Out' }
  ].reverse();

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-2 mb-8">
        <h3 className="text-gray-400 font-bold uppercase tracking-widest text-sm">{match.league?.name || 'Competition'}</h3>
        {isLive ? (
           <div className="inline-flex items-center bg-emerald-950 text-emerald-500 font-bold px-4 py-1.5 rounded-full text-sm border border-emerald-900 shadow-sm">
             <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
             {match.minute ? `${match.minute}'` : 'LIVE MATCH'}
           </div>
        ) : (
           <div className="inline-block bg-gray-900 text-gray-400 font-bold px-4 py-1.5 rounded-full text-sm border border-gray-800 uppercase tracking-wider">
             {match.status}
           </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between bg-gray-900 p-10 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col items-center flex-1 w-full md:w-auto">
          {match.homeTeam?.crest ? <img src={match.homeTeam.crest} className="w-32 h-32 mb-6 object-contain drop-shadow-lg" /> : <div className="w-32 h-32 bg-gray-800 rounded-full mb-6"></div>}
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-white">{match.homeTeam?.name}</h2>
        </div>
        <div className="text-7xl lg:text-8xl font-black px-12 tabular-nums tracking-tighter my-8 md:my-0 text-white drop-shadow-md">
          {match.score.home ?? '-'} <span className="text-gray-700 font-light mx-2">:</span> {match.score.away ?? '-'}
        </div>
        <div className="flex flex-col items-center flex-1 w-full md:w-auto">
          {match.awayTeam?.crest ? <img src={match.awayTeam.crest} className="w-32 h-32 mb-6 object-contain drop-shadow-lg" /> : <div className="w-32 h-32 bg-gray-800 rounded-full mb-6"></div>}
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-white">{match.awayTeam?.name}</h2>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-sm">
        <h3 className="text-sm font-bold text-gray-500 uppercase mb-5 text-center tracking-widest">Live Win Probability Model</h3>
        <WinProbBar homePct={45} drawPct={25} awayPct={30} homeName={match.homeTeam?.name} awayName={match.awayTeam?.name} />
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-bold mb-6 text-gray-200 flex items-center gap-2">Match Timeline</h3>
          <div className="relative border-l-2 border-gray-800 ml-5 space-y-8 py-2">
            {timeline.map((event, i) => (
              <div key={i} className="relative pl-8 group">
                 <div className="absolute w-5 h-5 bg-gray-900 rounded-full border-[3px] border-emerald-500 -left-[11px] top-1 shadow-sm group-hover:scale-110 transition-transform"></div>
                 <div className="font-bold text-emerald-400 text-sm mb-1">{event.min}'</div>
                 <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-sm hover:border-gray-700 transition-colors">
                   <div className="font-bold text-white tracking-wide">{event.type}</div>
                   <div className="text-sm text-gray-400 mt-1">{event.player} <span className="block mt-0.5 text-xs text-gray-600 font-medium">({event.team})</span></div>
                 </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-xl font-bold mb-6 text-gray-200">Predicted Lineups</h3>
          <div className="bg-green-900/10 border border-green-900/30 p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between h-[450px]">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
             <div className="relative z-10 w-full flex justify-around mt-4">
               {[1,2,3,4].map(n => <div key={n} className="w-10 h-10 rounded-full bg-blue-600 border-2 border-white text-xs flex items-center justify-center font-bold shadow-lg text-white">C{n}</div>)}
             </div>
             <div className="relative z-10 w-full flex justify-center py-8">
                <div className="text-white font-black opacity-[0.15] uppercase tracking-[0.4em] text-xl">Midfield Clash</div>
             </div>
             <div className="relative z-10 w-full flex justify-around mb-4">
               {[1,2,3,4].map(n => <div key={n} className="w-10 h-10 rounded-full bg-red-600 border-2 border-white text-xs flex items-center justify-center font-bold shadow-lg text-white">R{n}</div>)}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
