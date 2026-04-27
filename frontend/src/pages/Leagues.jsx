import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { Link } from 'react-router-dom';

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/leagues').then(res => setLeagues(res.data)).catch(()=>{}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-emerald-400 animate-pulse font-bold text-center mt-32 flex flex-col items-center">
      <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
      Loading tracked competitions...
  </div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 min-h-screen">
      <div className="border-b border-gray-800 pb-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Competitions Network</h1>
        <p className="text-gray-400 font-medium">Select a tracked league to view full standings, advanced statistics, and fixture schedules.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {leagues.length > 0 ? leagues.map(l => (
          <div key={l.code} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm hover:border-emerald-500/50 transition-colors flex flex-col justify-between h-48 group">
             <div>
                <h2 className="text-2xl font-black text-white mb-1 group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{l.name}</h2>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{l.country}</div>
             </div>
             <Link to={`/leagues/${l.code}`} className="bg-gray-950 border border-gray-800 hover:border-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold text-center hover:bg-emerald-950/30 transition-all block mt-4 shadow-sm">
                View Global Standings &rarr;
             </Link>
          </div>
        )) : (
           <div className="col-span-full py-20 text-center bg-gray-900 border border-gray-800 rounded-3xl shadow-sm">
              <div className="text-2xl font-black text-red-500 mb-2">No leagues detected in database.</div>
              <div className="text-gray-500">Wait for the backend server to finish its initial background sync.</div>
           </div>
        )}
      </div>
    </div>
  );
}
