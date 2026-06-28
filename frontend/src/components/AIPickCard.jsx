import React from 'react';
import { VersusHero, T, disp, num, label } from './fixture/primitives.jsx';

// AI pick on the new brand identity — the VersusHero seam crest up top, then
// the pick + a confidence ring in brand oxblood (was off-brand emerald).
const RISK_TONE = {
  low: { c: '#22C55E', bg: 'rgba(34,197,94,0.12)', b: 'rgba(34,197,94,0.4)' },
  medium: { c: '#EAB308', bg: 'rgba(234,179,8,0.12)', b: 'rgba(234,179,8,0.4)' },
  high: { c: '#EF4444', bg: 'rgba(239,68,68,0.12)', b: 'rgba(239,68,68,0.4)' },
};

export default function AIPickCard({ pick }) {
  if (!pick) return null;

  const confidence = pick.confidence || 0;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (confidence / 100) * circumference;
  const tone = RISK_TONE[pick.risk_level?.toLowerCase()] || { c: T.t2, bg: 'rgba(255,255,255,0.04)', b: T.b2 };

  const v = {
    home: pick.home_name || 'Home', away: pick.away_name || 'Away',
    league: pick.league_name || 'Competition', stage: '',
    state: 'upcoming', prob: null, score: null, kickoff: '',
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', background: T.raised, border: '1px solid ' + T.b2, borderRadius: 14, isolation: 'isolate' }}>
      <VersusHero
        v={v} t={{ accent: T.accent, colorMode: 'nation', density: 5, flagBg: false }}
        h={112} meta codes codeSize={17} disc={18} seam={[60, 40]} discTop={48}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...label(8.5), color: T.t3, marginBottom: 7 }}>AI pick</div>
            <div style={{ ...disp(17, 800), color: T.t1, lineHeight: 1.1 }}>{pick.pick_type || '—'}</div>
          </div>
          {/* Confidence ring — brand oxblood */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, flexShrink: 0 }}>
            <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="28" cy="28" r={radius} stroke={T.b2} strokeWidth="4" fill="transparent" />
              <circle cx="28" cy="28" r={radius} stroke={T.accent} strokeWidth="4" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.3,.7,.4,1)' }} />
            </svg>
            <div style={{ position: 'absolute', display: 'flex', alignItems: 'baseline' }}>
              <span style={{ ...num(16, 700), color: T.t1 }}>{confidence}</span>
              <span style={{ ...num(9, 500), color: T.t3 }}>%</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: tone.bg, border: '1px solid ' + tone.b }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone.c }} />
            <span style={{ ...label(8), color: tone.c }}>{(pick.risk_level || 'LOW')} risk</span>
          </span>
        </div>

        <div style={{ flex: 1, padding: 14, background: 'rgba(0,0,0,0.22)', borderRadius: 10, border: '1px solid ' + T.b1 }}>
          <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.55, color: T.t2, whiteSpace: 'pre-wrap', margin: 0 }}>
            {pick.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}
