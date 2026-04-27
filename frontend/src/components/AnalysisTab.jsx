import React from 'react';
import { TEAM_COLORS } from '../utils/colors';

import { getTeamColor, getColor, DRAW_COLOR } from '../constants/teamColors.js';

function WinProbDonut({ home_prob, draw_prob, away_prob, homeTeam, awayTeam }) {
  const homeColor = getColor(homeTeam?.name).primary;
  const awayColor = getColor(awayTeam?.name).primary;
  const hp = home_prob || 45, dp = draw_prob || 25, ap = away_prob || 30;
  const size = 160, cx = 80, cy = 80, r = 55, strokeW = 22;
  const circ = 2 * Math.PI * r;
  const homeDash = (hp / 100) * circ;
  const drawDash = (dp / 100) * circ;
  const awayDash = (ap / 100) * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{homeTeam?.name}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: homeColor }}>{hp}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>Draw</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9CA3AF' }}>{dp}%</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{awayTeam?.name}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: awayColor }}>{ap}%</div>
        </div>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={strokeW} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={homeColor} strokeWidth={strokeW} strokeDasharray={`${homeDash} ${circ - homeDash}`} strokeDashoffset={0} transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={DRAW_COLOR} strokeWidth={strokeW} strokeDasharray={`${drawDash} ${circ - drawDash}`} strokeDashoffset={-homeDash} transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={awayColor} strokeWidth={strokeW} strokeDasharray={`${awayDash} ${circ - awayDash}`} strokeDashoffset={-(homeDash + drawDash)} transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#9CA3AF" fontSize={11}>Win</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#9CA3AF" fontSize={11}>Probability</text>
      </svg>
    </div>
  );
}

function ScorelineMatrix({ homeTeam, awayTeam, homeAvg = 1.6, awayAvg = 1.2 }) {
  const homeColor = getColor(homeTeam?.name).primary;
  const awayColor = getColor(awayTeam?.name).primary;
  function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }
  function poisson(k, lam) { return (Math.pow(lam, k) * Math.exp(-lam)) / factorial(k); }
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3, 4, 5];
  const matrix = rows.map(a => cols.map(h => ({ h, a, prob: Math.round(poisson(h, homeAvg) * poisson(a, awayAvg) * 100) })));
  const maxProb = Math.max(...matrix.flat().map(c => c.prob));
  const likely = matrix.flat().find(c => c.prob === maxProb) || { h:0, a:0, prob:0 };

  return (
    <div style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', color: '#6B7280', textAlign: 'center' }}>Away↓ Home→</th>
            {cols.map(h => <th key={h} style={{ padding: '4px 8px', color: '#9CA3AF', textAlign: 'center' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td style={{ padding: '4px 8px', color: '#9CA3AF', textAlign: 'center', fontWeight: 700 }}>{ri}</td>
              {row.map((cell, ci) => {
                const alpha = cell.prob / maxProb;
                const bg = cell.h > cell.a ? homeColor : cell.h < cell.a ? awayColor : DRAW_COLOR;
                const isMax = cell.prob === maxProb;
                return (
                  <td key={ci} style={{ padding: '6px 8px', textAlign: 'center', borderRadius: 4, position: 'relative', background: bg + Math.round(alpha * 200 + 30).toString(16).padStart(2, '0'), color: alpha > 0.5 ? '#FFFFFF' : '#9CA3AF', fontWeight: isMax ? 800 : 400, boxShadow: isMax ? `0 0 12px ${bg}` : 'none', border: isMax ? `2px solid ${bg}` : 'none', transition: 'all 0.2s', zIndex: isMax ? 10 : 1 }}>
                    {isMax && <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>★</span>}
                    {cell.prob}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 12, color: '#F9FAFB', fontWeight: 700, textAlign: 'center' }}>
        Most likely: {likely.h}-{likely.a} ({likely.prob}%)
      </div>
    </div>
  );
}

function KeyMetrics({ homeTeam, awayTeam, stats }) {
  const homeColor = getColor(homeTeam?.name).primary;
  const awayColor = getColor(awayTeam?.name).primary;
  const rows = stats || [
    { label: 'Possession', home: 54, away: 46 }, { label: 'Shots', home: 14, away: 11 },
    { label: 'On Target', home: 6, away: 4 }, { label: 'xG', home: 1.8, away: 1.2 },
    { label: 'Pass Acc%', home: 87, away: 83 }, { label: 'Tackles', home: 18, away: 22 },
  ];
  return (
    <div>
      {rows.map((row, i) => {
        const total = row.home + row.away;
        const homePct = Math.round((row.home / total) * 100);
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 13 }}>{row.home}</span>
              <span style={{ color: '#9CA3AF', fontSize: 12 }}>{row.label}</span>
              <span style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 13 }}>{row.away}</span>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${homePct}%`, background: homeColor, transition: 'width 0.5s' }} />
              <div style={{ width: `${100 - homePct}%`, background: awayColor, transition: 'width 0.5s' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AnalysisTab({ fixture, analysis, loading }) {
  const homeTeam = fixture.homeTeam;
  const awayTeam = fixture.awayTeam;
  const homeColor = getColor(homeTeam?.name).primary;
  const awayColor = getColor(awayTeam?.name).primary;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#1a0a0a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12, fontWeight: 600 }}>Win Probability</div>
          <WinProbDonut
            home_prob={analysis?.win_probability?.home || fixture.home_prob || 45}
            draw_prob={analysis?.win_probability?.draw || fixture.draw_prob || 25}
            away_prob={analysis?.win_probability?.away || fixture.away_prob || 30}
            homeTeam={homeTeam} awayTeam={awayTeam}
          />
        </div>
        
        {/* xG Chart with Season Average reference line */}
        <div style={{ background: '#1a0a0a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12, fontWeight: 600 }}>Expected Goals (xG)</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 12, height: 140, padding: '0 8px', marginTop: 10 }}>
            {/* Reference Line */}
            <div style={{ position: 'absolute', bottom: `${(1.2 / 4) * 100}%`, left: 0, right: 0, borderBottom: '1px dashed #6B7280', zIndex: 0 }} />
            <div style={{ position: 'absolute', bottom: `calc(${(1.2 / 4) * 100}% + 4px)`, left: 0, fontSize: 10, color: '#6B7280' }}>League avg (1.2)</div>
            
            {[
              { team: homeTeam?.name, val: analysis?.xg?.home_for || 1.8, color: homeColor, label: 'For' },
              { team: homeTeam?.name, val: analysis?.xg?.home_against || 1.1, color: homeColor, label: 'Ag' },
              { team: awayTeam?.name, val: analysis?.xg?.away_for || 1.4, color: awayColor, label: 'For' },
              { team: awayTeam?.name, val: analysis?.xg?.away_against || 1.2, color: awayColor, label: 'Ag' },
            ].map((bar, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, zIndex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F9FAFB' }}>{bar.val}</span>
                <div style={{ width: '80%', height: `${Math.min((bar.val / 4) * 100, 100)}%`, background: bar.val >= 1.2 ? bar.color : `${bar.color}66`, borderRadius: '4px 4px 0 0', minHeight: 8 }} />
                <span style={{ fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap' }}>{bar.team?.substring(0, 3).toUpperCase()} {bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#1a0a0a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12, fontWeight: 600 }}>Scoreline Probability Matrix</div>
          <ScorelineMatrix homeTeam={homeTeam} awayTeam={awayTeam} homeAvg={analysis?.xg?.home_for || 1.6} awayAvg={analysis?.xg?.away_for || 1.2} />
        </div>
        <div style={{ background: '#1a0a0a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12, fontWeight: 600 }}>Key Match Metrics</div>
          <KeyMetrics homeTeam={homeTeam} awayTeam={awayTeam} />
        </div>
      </div>
    </>
  );
}
