import React, { useState } from 'react';
import { useAIPicks } from '../hooks/useAIPicks';
import AIPickCard from '../components/AIPickCard';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function AIPicks() {
  const { todayPicks, loading } = useAIPicks();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
     setRefreshing(true);
     await api.post('/ai/picks/refresh').catch(console.error);
     window.location.reload(); 
  };

  if (loading || refreshing) return (
     <div className="p-8 text-emerald-400 font-bold flex flex-col items-center justify-center mt-32">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        Analysing today's matches with AI...
     </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 min-h-screen pb-16">
      <div className="flex flex-col md:flex-row justify-between md:items-end border-b border-gray-800 pb-6 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Today's AI Picks</h1>
          <p className="text-gray-400 font-medium">Low-risk recommendations conditionally analyzed by Anthropic Claude upon request.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleRefresh} disabled={refreshing} className="bg-gray-900 border border-gray-700 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm shadow-sm">
            Refresh Model Picks
          </button>
          <Link to="/ai-picks/history" className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm shadow-sm border border-gray-700">
            View Analytics History &rarr;
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {todayPicks.length > 0 ? (
          todayPicks.map((pick, i) => <AIPickCard key={pick.id || i} pick={pick} />)
        ) : (
          <div className="col-span-full py-20 text-center bg-gray-900 border border-gray-800 rounded-3xl shadow-sm">
            <h2 className="text-2xl font-extrabold text-gray-400 mb-3">No low-risk picks identified for today.</h2>
            <p className="text-gray-500 max-w-md mx-auto">Our automated model found no opportunities that meet the strict confidence threshold parameters. We prioritize safety over volume.</p>
          </div>
        )}
      </div>
    </div>
  );
}
