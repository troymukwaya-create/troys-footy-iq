import React from 'react';
import { useAIPicks } from '../hooks/useAIPicks';
import { Link } from 'react-router-dom';

export default function PickHistory() {
  const { history, loading } = useAIPicks();

  if (loading) return <div className="p-8 text-gray-400 animate-pulse text-lg flex justify-center mt-20">Aggregating historical pick data...</div>;

  const { picks = [], accuracy = 0, summary = {} } = history || {};

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between md:items-end border-b border-gray-800 pb-6 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Pick History</h1>
          <p className="text-gray-400 font-medium">Verified track record of all model recommendations.</p>
        </div>
        <div className="flex items-center">
          <Link to="/ai-picks" className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm shadow-sm border border-gray-700">
            &larr; Back to Today
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl text-center shadow-sm">
          <span className="block text-gray-500 text-xs mb-3 uppercase tracking-widest font-bold">Total Picks Analyzed</span>
          <span className="text-5xl font-black text-blue-400">{summary.total || 0}</span>
        </div>
        <div className="bg-gray-900 border border-emerald-900/60 p-8 rounded-2xl text-center shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-2 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
          <span className="block text-emerald-400 text-xs mb-3 uppercase tracking-widest font-bold opacity-90">Model Win Rate</span>
          <span className="text-5xl font-black text-emerald-400">{accuracy.toFixed(1)}%</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl text-center shadow-sm flex items-center justify-around">
          <div className="flex flex-col items-center">
            <span className="block text-gray-500 text-xs mb-2 uppercase tracking-widest font-bold">Wins</span>
            <span className="text-4xl font-black text-white">{summary.wins || 0}</span>
          </div>
          <div className="w-px h-16 bg-gray-800"></div>
          <div className="flex flex-col items-center">
            <span className="block text-gray-500 text-xs mb-2 uppercase tracking-widest font-bold">Losses</span>
            <span className="text-4xl font-black text-red-500">{summary.losses || 0}</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-sm mt-8 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-950 text-gray-400 text-xs uppercase tracking-widest border-b border-gray-800">
              <tr>
                <th className="p-5 font-bold">Date</th>
                <th className="p-5 font-bold">Match</th>
                <th className="p-5 font-bold">Pick</th>
                <th className="p-5 font-bold text-center">Confidence</th>
                <th className="p-5 font-bold text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80 text-gray-300">
              {picks.length > 0 ? picks.map((p, i) => (
                <tr key={i} className="hover:bg-gray-800/60 transition-colors">
                  <td className="p-5 text-sm whitespace-nowrap">{new Date(p.created_at || p.match_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}</td>
                  <td className="p-5 font-medium whitespace-nowrap">{p.fixture_name || `Fixture #${p.fixture_id}`}</td>
                  <td className="p-5 whitespace-nowrap">
                    <span className="bg-gray-800 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-md text-xs font-bold tracking-wide">{p.pick_type}</span>
                  </td>
                  <td className="p-5 text-center">
                    <span className={`text-lg ${p.confidence >= 70 ? 'text-emerald-400 font-extrabold' : 'text-amber-400 font-bold'}`}>{p.confidence}%</span>
                  </td>
                  <td className="p-5 text-center">
                    {p.actual_result === 'WIN' ? (
                      <span className="inline-flex bg-emerald-950/50 text-emerald-400 px-4 py-1.5 rounded border border-emerald-900/50 text-xs font-black tracking-widest">WIN</span>
                    ) : p.actual_result === 'LOSS' ? (
                      <span className="inline-flex bg-red-950/50 text-red-400 px-4 py-1.5 rounded border border-red-900/50 text-xs font-black tracking-widest">LOSS</span>
                    ) : (
                      <span className="inline-flex bg-gray-800/80 text-gray-400 px-4 py-1.5 rounded border border-gray-700/50 text-xs font-bold tracking-widest">PENDING</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-gray-500 font-medium tracking-wide">No processed AI models found in database.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
