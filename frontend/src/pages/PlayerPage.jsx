import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export default function PlayerPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/players/${id}`).then(res => setData(res.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-gray-400 animate-pulse text-lg flex justify-center mt-20">Loading player bio...</div>;
  if (!data) return <div className="p-8 text-red-500 font-bold text-center mt-20">Player not found.</div>;

  const { bio, season_stats: stats, career_history: history } = data;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 min-h-screen pb-16">
      <div className="flex flex-col md:flex-row items-center md:items-end gap-8 border-b border-gray-800 pb-8 bg-gray-900/50 p-8 rounded-3xl border">
        <div className="w-32 h-32 md:w-40 md:h-40 bg-gray-950 rounded-full overflow-hidden shadow-2xl border-4 border-gray-800 flex-shrink-0 flex items-center justify-center">
          <img src={`https://ui-avatars.com/api/?name=${bio?.name || 'P'}&background=030712&color=10b981&size=256`} alt="Player" className="w-full h-full object-cover" />
        </div>
        <div className="text-center md:text-left flex-1">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">{bio?.name}</h1>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
             <span className="bg-gray-800 text-gray-300 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-widest">{bio?.position}</span>
             <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 px-4 py-1.5 rounded-full text-sm font-bold tracking-widest">{bio?.current_team}</span>
             <span className="bg-gray-800 text-gray-300 px-4 py-1.5 rounded-full text-sm font-bold tracking-widest">{bio?.nationality}</span>
             <span className="bg-gray-800 text-gray-300 px-4 py-1.5 rounded-full text-sm font-bold">{bio?.age} yrs</span>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest">Season Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Goals', value: stats?.goals },
            { label: 'Assists', value: stats?.assists },
            { label: 'Appearances', value: stats?.appearances },
            { label: 'Minutes', value: stats?.minutes },
            { label: 'Yellows', value: stats?.yellow_cards, color: 'text-amber-400' },
            { label: 'Reds', value: stats?.red_cards, color: 'text-red-500' }
          ].map(stat => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center shadow-sm hover:border-gray-700 transition-colors">
              <span className="text-gray-500 text-[10px] mb-2 uppercase tracking-[0.2em] font-bold text-center">{stat.label}</span>
              <span className={`text-4xl font-black ${stat.color || 'text-white'}`}>{stat.value ?? '-'}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
         <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest">Career History</h2>
         <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-sm">
           <div className="overflow-x-auto">
           <table className="w-full text-left">
             <thead className="bg-gray-950">
               <tr className="border-b border-gray-800">
                 <th className="p-5 font-bold text-[10px] text-gray-500 uppercase tracking-[0.2em]">Season</th>
                 <th className="p-5 font-bold text-[10px] text-gray-500 uppercase tracking-[0.2em]">Club</th>
                 <th className="p-5 font-bold text-[10px] text-gray-500 uppercase tracking-[0.2em] text-center">Goals</th>
                 <th className="p-5 font-bold text-[10px] text-gray-500 uppercase tracking-[0.2em] text-center">Assists</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-800/60 text-gray-300">
               {history?.length > 0 ? history.map((h, i) => (
                 <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                   <td className="p-5 font-bold text-sm">{h.season}</td>
                   <td className="p-5 font-medium text-white">{h.club}</td>
                   <td className="p-5 text-center font-bold text-emerald-400">{h.goals}</td>
                   <td className="p-5 text-center font-bold text-white">{h.assists}</td>
                 </tr>
               )) : (
                 <tr><td colSpan="4" className="p-8 text-center text-gray-500 italic">No career history available.</td></tr>
               )}
             </tbody>
           </table>
           </div>
         </div>
      </section>
    </div>
  );
}
