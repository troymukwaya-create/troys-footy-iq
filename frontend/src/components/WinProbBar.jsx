import React from 'react';

export default function WinProbBar({ homePct, drawPct, awayPct, homeName = 'Home', awayName = 'Away' }) {
  return (
    <div className="w-full flex h-8 rounded-md overflow-hidden text-xs font-bold text-white shadow-inner">
      <div 
        className="bg-blue-600 flex items-center justify-center truncate px-1 transition-all duration-500"
        style={{ width: `${homePct}%` }}
        title={`${homeName} Win: ${homePct}%`}
      >
        {homePct > 15 ? `${homeName} ${homePct}%` : `${homePct}%`}
      </div>
      <div 
        className="bg-gray-500 flex items-center justify-center truncate border-x border-gray-700 transition-all duration-500"
        style={{ width: `${drawPct}%` }}
        title={`Draw: ${drawPct}%`}
      >
        {drawPct > 15 && `Draw ${drawPct}%`}
      </div>
      <div 
        className="bg-red-600 flex items-center justify-center truncate px-1 transition-all duration-500"
        style={{ width: `${awayPct}%` }}
        title={`${awayName} Win: ${awayPct}%`}
      >
         {awayPct > 15 ? `${awayName} ${awayPct}%` : `${awayPct}%`}
      </div>
    </div>
  );
}
