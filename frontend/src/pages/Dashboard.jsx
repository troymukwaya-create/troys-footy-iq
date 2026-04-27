import React, { useEffect, useState } from 'react';
import { useAIPicks } from '../hooks/useAIPicks';
import LiveScoreCard from '../components/LiveScoreCard';
import AIPickCard from '../components/AIPickCard';
import api from '../api/client';
import { Link } from 'react-router-dom';

const FixtureGroup = ({ fixtures, title }) => {
  const grouped = fixtures.reduce((acc, f) => {
    const lName = f.league?.name || 'Other Competitions';
    if (!acc[lName]) acc[lName] = [];
    acc[lName].push(f);
    return acc;
  }, {});

  if (fixtures.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-4 text-gray-200 uppercase tracking-widest">{title}</h2>
      <div className="space-y-6">
        {Object.entries(grouped).map(([leagueName, matches]) => (
          <div key={leagueName} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              {leagueName}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {matches.map(m => <LiveScoreCard key={m.id} match={m} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const UpcomingGroup = ({ fixtures }) => {
  const byDate = fixtures.reduce((acc, f) => {
     const d = new Date(f.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
     if (!acc[d]) acc[d] = [];
     acc[d].push(f);
     return acc;
  }, {});

  if (fixtures.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-6 text-gray-200 uppercase tracking-widest">UPCOMING THIS WEEK</h2>
      <div className="space-y-8">
         {Object.entries(byDate).map(([dateStr, dayMatches]) => {
            const byLeague = dayMatches.reduce((acc, f) => {
              const lName = f.league?.name || 'Other';
              if (!acc[lName]) acc[lName] = [];
              acc[lName].push(f);
              return acc;
            }, {});
            
            return (
               <div key={dateStr}>
                 <h3 className="text-lg font-bold text-emerald-500 mb-4">{dateStr}</h3>
                 <div className="space-y-6">
                    {Object.entries(byLeague).map(([leagueName, matches]) => (
                      <div key={leagueName} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm">
                         <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                           {leagueName}
                         </h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {matches.map(m => <LiveScoreCard key={m.id} match={m} />)}
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
            );
         })}
      </div>
    </section>
  );
};

export default function Dashboard() {
  const { todayPicks, loading: picksLoading } = useAIPicks();
  const [liveMatches, setLiveMatches] = useState([]);
  const [todayMatches, setTodayMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await api.get('/fixtures/live');
        setLiveMatches(res.data || []);
      } catch(e) { console.error('Live sync error', e); }
    };

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [todayRes, upcomingRes] = await Promise.all([
          api.get('/fixtures/today').catch(()=>({data:[]})),
          api.get('/fixtures/upcoming').catch(()=>({data:[]}))
        ]);
        setTodayMatches(todayRes.data || []);
        
        // Ensure upcoming doesn't include today's matches
        const todayIds = new Set((todayRes.data || []).map(m => m.id));
        setUpcomingMatches((upcomingRes.data || []).filter(m => !todayIds.has(m.id)));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };

    fetchLive();
    fetchAll();

    const int = setInterval(fetchLive, 30000);
    return () => clearInterval(int);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse p-4">
        <div className="h-8 w-48 bg-gray-800 rounded-md"></div>
        <div className="h-64 bg-gray-900 border border-gray-800 rounded-2xl"></div>
        <div className="h-64 bg-gray-900 border border-gray-800 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 min-h-screen pb-16">
      
      {liveMatches.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">LIVE NOW</h2>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {liveMatches.map(m => (
              <div key={m.id} className="ring-1 ring-emerald-500/50 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)] bg-emerald-950/10">
                 <LiveScoreCard match={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      {todayMatches.length > 0 ? (
        <FixtureGroup fixtures={todayMatches} title="TODAY'S FIXTURES" />
      ) : (
        <section className="mb-8">
           <h2 className="text-xl font-bold mb-4 text-gray-200">TODAY'S FIXTURES</h2>
           <div className="text-gray-500 text-sm italic p-6 bg-gray-900 rounded-2xl border border-gray-800 text-center">No fixtures scheduled for today.</div>
        </section>
      )}

      {upcomingMatches.length > 0 && (
        <UpcomingGroup fixtures={upcomingMatches} />
      )}

      <section className="border-t border-gray-800 pt-8 mt-8">
        <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-black text-white flex items-center gap-2">
             🔥 AI PICKS TODAY
           </h2>
           <Link to="/ai-picks" className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">View detailed analysis &rarr;</Link>
        </div>
        
        {picksLoading ? (
           <div className="p-8 text-emerald-400 animate-pulse text-sm font-bold flex items-center justify-center bg-gray-900 rounded-2xl border border-gray-800">
             <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3"></div>
             Analysing matches...
           </div>
        ) : todayPicks.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {todayPicks.map(pick => <AIPickCard key={pick.id} pick={pick} />)}
          </div>
        ) : (
          <div className="p-8 text-gray-500 italic bg-gray-900 rounded-2xl border border-gray-800 text-center">
             No low-risk picks identified for today's matches.
          </div>
        )}
      </section>
    </div>
  );
}
