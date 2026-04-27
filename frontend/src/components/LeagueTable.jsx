import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormStrip from './FormStrip';
import { Link } from 'react-router-dom';

export default function LeagueTable({ standings }) {
  if (!standings || standings.length === 0) return <div className="text-gray-500 italic p-8 bg-gray-900 rounded-2xl border border-gray-800 text-center shadow-sm">No standings currently available.</div>;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-gray-950">
          <TableRow className="border-gray-800 hover:bg-transparent">
            <TableHead className="w-12 text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] py-4">#</TableHead>
            <TableHead className="text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] py-4 pl-6">Team</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4">P</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4">W</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4">D</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4">L</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4 hidden sm:table-cell">GF</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-10 py-4 hidden sm:table-cell">GA</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-12 py-4 hidden md:table-cell">GD</TableHead>
            <TableHead className="text-center text-white font-black text-xs uppercase tracking-widest w-16 py-4">Pts</TableHead>
            <TableHead className="text-center text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] w-32 py-4 hidden lg:table-cell">Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-gray-800/60">
          {standings.map((row) => {
            const pos = row.position;
            let stripeColor = 'bg-transparent';
            if (pos <= 4) stripeColor = 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]';
            else if (pos <= 6) stripeColor = 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]';
            else if (pos >= standings.length - 2 && standings.length > 10) stripeColor = 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'; // dynamically detect bottom 3

            return (
              <TableRow key={row.team?.id || row.position} className="border-0 hover:bg-gray-800/40 transition-colors relative group">
                <TableCell className="w-12 p-0 text-center relative h-14">
                   <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripeColor}`}></div>
                   <span className="font-bold text-gray-400 text-sm">{pos}</span>
                </TableCell>
                <TableCell className="font-bold pl-6 py-0 absolute-row-center">
                  <Link to={`/teams/${row.team?.id}`} className="flex items-center gap-4 hover:text-emerald-400 transition-colors py-2">
                    <img src={row.team?.crest || row.team?.logo_url || "https://upload.wikimedia.org/wikipedia/commons/1/11/Blue_question_mark_icon.svg"} className="w-7 h-7 object-contain drop-shadow-sm p-0.5 bg-gray-950 rounded-full border border-gray-800 flex-shrink-0" alt="" />
                    <span className="truncate max-w-[150px] sm:max-w-xs text-sm text-gray-200">{row.team?.shortName || row.team?.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-center text-gray-400 font-semibold text-sm">{row.playedGames}</TableCell>
                <TableCell className="text-center text-gray-300 font-medium text-sm">{row.won}</TableCell>
                <TableCell className="text-center text-gray-300 font-medium text-sm">{row.draw}</TableCell>
                <TableCell className="text-center text-gray-300 font-medium text-sm">{row.lost}</TableCell>
                <TableCell className="text-center text-gray-500 text-sm hidden sm:table-cell">{row.goalsFor}</TableCell>
                <TableCell className="text-center text-gray-500 text-sm hidden sm:table-cell">{row.goalsAgainst}</TableCell>
                <TableCell className="text-center font-bold text-gray-400 text-sm hidden md:table-cell">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell>
                <TableCell className="text-center font-black text-white text-base bg-gray-950/40 group-hover:bg-transparent transition-colors">{row.points}</TableCell>
                <TableCell className="text-center hidden lg:table-cell h-full align-middle">
                   <div className="flex justify-center scale-90 opacity-90 group-hover:opacity-100 transition-opacity">
                      <FormStrip form={row.form || ''} />
                   </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
