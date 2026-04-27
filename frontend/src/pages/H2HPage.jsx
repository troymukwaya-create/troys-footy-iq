import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import LiveScoreCard from '../components/LiveScoreCard';

export default function H2HPage() {
  const { team1Id, team2Id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/h2h/${team1Id}/${team2Id}`).then(res => setData(res.data)).catch(console.error);
  }, [team1Id, team2Id]);

  if (!data) return <div className="p-8 text-gray-400 animate-pulse text-lg">Loading Head-to-Head...</div>;

  const matches = data.db_history?.length ? data.db_history : (data.api_history?.matches || []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-center gap-8 border-b border-gray-800 pb-8 pt-4">
        <div className="flex flex-col items-center">
           <div className="w-24 h-24 bg-gray-900 rounded-full border border-gray-800 flex flex-shrink-0 items-center justify-center shadow-xl mb-4 text-2xl font-bold text-gray-600">
             {team1Id}
           </div>
           <h2 className="text-xl font-bold">Team A</h2>
        </div>
        <div className="text-4xl font-black text-gray-700 mx-4">VS</div>
        <div className="flex flex-col items-center">
           <div className="w-24 h-24 bg-gray-900 rounded-full border border-gray-800 flex flex-shrink-0 items-center justify-center shadow-xl mb-4 text-2xl font-bold text-emerald-500">
             {team2Id}
           </div>
           <h2 className="text-xl font-bold">Team B</h2>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
         <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center shadow-sm">
           <span className="block text-gray-400 text-xs mb-2 uppercase tracking-wider font-semibold">Team A Wins</span>
           <span className="text-4xl font-bold text-white">4</span>
         </div>
         <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center shadow-sm">
           <span className="block text-gray-400 text-xs mb-2 uppercase tracking-wider font-semibold">Draws</span>
           <span className="text-4xl font-bold text-amber-500">2</span>
         </div>
         <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center shadow-sm">
           <span className="block text-gray-400 text-xs mb-2 uppercase tracking-wider font-semibold">Team B Wins</span>
           <span className="text-4xl font-bold text-emerald-500">3</span>
         </div>
      </div>

      <div className="pt-4">
        <h2 className="text-xl font-bold mb-6 text-gray-200">Last 10 Meetings</h2>
        <div className="space-y-3">
          {matches.length > 0 ? (
            matches.slice(0, 10).map((m, i) => <LiveScoreCard key={i} match={m} />)
          ) : (
             <div className="p-8 border border-gray-800 bg-gray-900 rounded-xl text-center text-gray-500 italic">No recent match history found between these two teams.</div>
          )}
        </div>
      </div>
    </div>
  );
}
