import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTeamStats } from '../hooks/useTeamStats';
import LiveScoreCard from '../components/LiveScoreCard';
import FormStrip from '../components/FormStrip';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function TeamPage() {
  const { id } = useParams();
  const { data, loading } = useTeamStats(id);

  if (loading) return <div className="p-8 text-gray-400 animate-pulse text-lg">Loading team profile...</div>;
  if (!data || !data.team) return <div className="p-8 text-red-400">Team not found</div>;

  const { team, stats, past, upcoming } = data;

  const mockTimingData = [
    { name: '0-15', scored: 4, conceded: 2 },
    { name: '16-30', scored: 3, conceded: 5 },
    { name: '31-45', scored: 8, conceded: 3 },
    { name: '46-60', scored: 5, conceded: 7 },
    { name: '61-75', scored: 9, conceded: 4 },
    { name: '76-90+', scored: 12, conceded: 8 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-6 border-b border-gray-800 pb-6">
        <div className="w-24 h-24 bg-gray-900 rounded-full flex flex-shrink-0 items-center justify-center p-4 border border-gray-800 shadow-xl">
           {team.logo_url ? <img src={team.logo_url} alt="" className="w-full h-full object-contain" /> : <div className="text-3xl font-bold text-emerald-500">{team.short_name || team.name?.charAt(0)}</div>}
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{team.name}</h1>
          <p className="text-gray-400 mt-2 font-medium">{team.stadium || 'Unknown Stadium'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Played', value: stats?.played || 0 },
          { label: 'Goals Scored', value: stats?.goals_for || 0 },
          { label: 'Goals Conceded', value: stats?.goals_against || 0 },
          { label: 'Clean Sheets', value: stats?.clean_sheets || 0 }
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex flex-col items-center justify-center shadow-sm">
            <span className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-semibold">{stat.label}</span>
            <span className="text-3xl font-bold text-white">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           <section className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-sm">
              <h2 className="text-xl font-bold mb-6 text-gray-200">Goal Timing</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockTimingData} maxBarSize={40}>
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: '#374151'}} contentStyle={{backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#fff'}} />
                    <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                    <Bar dataKey="scored" name="Scored" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="conceded" name="Conceded" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </section>
           
           <section>
             <h2 className="text-xl font-bold mb-4 text-gray-200">Upcoming Fixtures</h2>
             <div className="space-y-3">
               {(upcoming || []).length > 0 ? (
                 (upcoming || []).map(f => <LiveScoreCard key={f.id} match={f} />)
               ) : (
                 <div className="text-gray-500 italic bg-gray-900 p-4 border border-gray-800 rounded-md">No upcoming matches available.</div>
               )}
             </div>
           </section>
        </div>

        <div className="space-y-6">
           <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-sm">
             <h2 className="text-xl font-bold mb-6 text-center text-gray-200">Form Guide</h2>
             <div className="flex justify-center scale-150 transform mb-2">
               <FormStrip form={stats?.form || 'WDLWD'} />
             </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center shadow-sm">
                <span className="block text-gray-400 text-xs mb-2 uppercase tracking-wider font-semibold">BTTS Rate</span>
                <span className="text-2xl font-bold text-emerald-400">
                   {stats?.played ? Math.round((stats.btts_count / stats.played) * 100) : 0}%
                </span>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-center shadow-sm">
                <span className="block text-gray-400 text-xs mb-2 uppercase tracking-wider font-semibold">Over 2.5 Rate</span>
                <span className="text-2xl font-bold text-emerald-400">
                   {stats?.played ? Math.round((stats.over25_count / stats.played) * 100) : 0}%
                </span>
              </div>
           </div>

           <div>
              <h2 className="text-xl font-bold mb-4 text-gray-200">Recent Results</h2>
              <div className="space-y-3">
                {(past || []).length > 0 ? (
                  (past || []).map(f => <LiveScoreCard key={f.id} match={f} />)
                ) : (
                  <div className="text-gray-500 italic bg-gray-900 p-4 border border-gray-800 rounded-md">No past matches available.</div>
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
