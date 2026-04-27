import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function AIPickCard({ pick }) {
  if (!pick) return null;

  const getRiskColor = (risk) => {
    switch (risk?.toLowerCase()) {
      case 'low': return 'bg-emerald-950/50 text-emerald-400 border-emerald-900 shadow-[0_0_12px_rgba(16,185,129,0.2)]';
      case 'medium': return 'bg-amber-950/50 text-amber-400 border-amber-900 shadow-[0_0_12px_rgba(245,158,11,0.2)]';
      case 'high': return 'bg-red-950/50 text-red-500 border-red-900 shadow-[0_0_12px_rgba(239,68,68,0.2)]';
      default: return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  const confidence = pick.confidence || 0;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (confidence / 100) * circumference;

  return (
    <Card className="bg-gray-900 border-gray-800 shadow-sm relative overflow-hidden h-full flex flex-col hover:border-emerald-500/30 transition-colors group">
      <CardContent className="p-6 flex-1 flex flex-col relative z-10">
        <div className="flex justify-between items-start mb-6">
           <div>
             <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-800 pb-1 inline-block">{pick.league_name || 'Competition'}</div>
             <h3 className="font-bold text-white text-lg leading-tight">{pick.home_name || 'Home'} <span className="text-gray-600 font-light mx-1">vs</span> {pick.away_name || 'Away'}</h3>
           </div>
           
           {/* Confidence Ring */}
           <div className="relative flex items-center justify-center w-16 h-16 flex-shrink-0">
             <svg className="w-full h-full transform -rotate-90">
               <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-800" />
               <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={`transition-all duration-1000 ${confidence >= 70 ? 'text-emerald-500' : 'text-amber-500'}`} strokeLinecap="round" />
             </svg>
             <div className="absolute flex flex-col items-center justify-center">
               <span className="text-base font-black text-white">{confidence}<span className="text-[10px] text-gray-400">%</span></span>
             </div>
           </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
           <span className="bg-gray-950 border border-gray-800 text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide">{pick.pick_type}</span>
           <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getRiskColor(pick.risk_level)}`}>{pick.risk_level || 'LOW'} RISK</span>
        </div>

        <div className="p-4 bg-gray-950/50 rounded-xl border border-gray-800/50 mt-2 flex-1">
          <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
            {pick.reasoning}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
