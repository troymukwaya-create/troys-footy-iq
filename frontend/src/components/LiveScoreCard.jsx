import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

export default function LiveScoreCard({ match }) {
  if (!match) return null;

  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED' || match.status === 'AWARDED';
  const isToday = new Date(match.date).toDateString() === new Date().toDateString();

  let statusBadge = null;
  if (isLive) {
     statusBadge = <Badge variant="outline" className="bg-emerald-950/50 text-emerald-400 border-emerald-900 shadow-sm animate-pulse whitespace-nowrap">LIVE {match.minute ? `${match.minute}'` : ''}</Badge>;
  } else if (isFinished) {
     statusBadge = <Badge variant="outline" className="bg-gray-800 text-white border-gray-700 whitespace-nowrap">FT</Badge>;
  } else if (isToday) {
     statusBadge = <Badge variant="outline" className="bg-blue-950/50 text-blue-400 border-blue-900 whitespace-nowrap">TODAY</Badge>;
  } else {
     statusBadge = <Badge variant="outline" className="bg-gray-800 text-gray-400 border-gray-700 whitespace-nowrap">UPCOMING</Badge>;
  }

  return (
    <Link to={`/live/${match.id}`} className="block h-full group">
      <Card className="bg-gray-900 border-gray-800 hover:border-emerald-500/50 transition-all h-full shadow-sm hover:shadow-emerald-900/20 overflow-hidden">
        <CardContent className="p-5 flex flex-col justify-between h-full bg-gradient-to-b from-transparent to-gray-900/50 group-hover:to-gray-800/30">
          <div className="flex justify-between items-start mb-5">
             <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-950/80 px-2.5 py-1 rounded truncate max-w-[120px] border border-gray-800">
               {match.league?.name || 'Competition'}
             </div>
             {statusBadge}
          </div>
          
          <div className="flex justify-between items-center px-1">
             <div className="flex flex-col items-center w-5/12 text-center group-hover:text-emerald-400 transition-colors">
                <div className="w-12 h-12 mb-3 bg-gray-950/50 rounded-full p-1.5 border border-gray-800/50">
                   {match.homeTeam?.crest ? <img src={match.homeTeam.crest} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-gray-800 rounded-full"></div>}
                </div>
                <span className="font-bold text-sm leading-tight text-gray-200 line-clamp-2">{match.homeTeam?.name}</span>
             </div>
             
             <div className="flex flex-col items-center justify-center w-2/12 h-full -mt-4">
                {isLive || isFinished ? (
                   <div className="text-xl font-black tabular-nums bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-800 shadow-inner tracking-widest text-white group-hover:border-gray-700 transition-colors">
                      {match.score.home ?? '-'}<span className="text-gray-600 font-light mx-1">:</span>{match.score.away ?? '-'}
                   </div>
                ) : (
                   <div className="text-xs font-bold bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg border border-gray-700 shadow-sm whitespace-nowrap">
                      {new Date(match.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </div>
                )}
             </div>
             
             <div className="flex flex-col items-center w-5/12 text-center group-hover:text-emerald-400 transition-colors">
                <div className="w-12 h-12 mb-3 bg-gray-950/50 rounded-full p-1.5 border border-gray-800/50">
                   {match.awayTeam?.crest ? <img src={match.awayTeam.crest} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-gray-800 rounded-full"></div>}
                </div>
                <span className="font-bold text-sm leading-tight text-gray-200 line-clamp-2">{match.awayTeam?.name}</span>
             </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
