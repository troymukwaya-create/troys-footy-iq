import React, { useState } from 'react';

const LEAGUE_TREE = [
  {
    country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    leagues: [
      { code: 'PL', name: 'Premier League' },
      { code: 'ELC', name: 'Championship' },
    ]
  },
  {
    country: 'Spain', flag: '🇪🇸',
    leagues: [
      { code: 'PD', name: 'La Liga' },
    ]
  },
  {
    country: 'Germany', flag: '🇩🇪',
    leagues: [
      { code: 'BL1', name: 'Bundesliga' },
    ]
  },
  {
    country: 'Italy', flag: '🇮🇹',
    leagues: [
      { code: 'SA', name: 'Serie A' },
    ]
  },
  {
    country: 'France', flag: '🇫🇷',
    leagues: [
      { code: 'FL1', name: 'Ligue 1' },
    ]
  },
  {
    country: 'Brazil', flag: '🇧🇷',
    leagues: [
      { code: 'BSA', name: 'Brasileirao A' },
    ]
  },
  {
    country: 'UEFA', flag: '🇪🇺',
    leagues: [
      { code: 'CL', name: 'Champions League' },
      { code: 'EL', name: 'Europa League' },
    ]
  },
  {
    country: 'Netherlands', flag: '🇳🇱',
    leagues: [{ code: 'ERE', name: 'Eredivisie' }]
  },
  {
    country: 'Portugal', flag: '🇵🇹',
    leagues: [{ code: 'PPL', name: 'Primeira Liga' }]
  },
];

export function LeagueSidebar({ fixtures = [], liveMatches = [], activeLeague, onSelectLeague, onGoDashboard }) {
  const [expanded, setExpanded] = useState({
    'England': true,
    'Spain': true,
    'UEFA': true,
  });

  const toggle = (country) => setExpanded(prev => ({ ...prev, [country]: !prev[country] }));

  const liveCount = (liveMatches || []).length || (fixtures || []).filter(f => f.status === 'IN_PLAY' || f.status === 'PAUSED').length;

  return (
    <div className="flex flex-col border-b border-white/[0.04]">
      {/* Quick Filters */}
      <nav className="px-2 pt-3 pb-2 space-y-0.5">
        <SidebarBtn
          active={activeLeague === 'ALL'}
          onClick={onGoDashboard}
          icon="⚽"
          label="All Matches"
        />
        <SidebarBtn
          active={activeLeague === 'LIVE'}
          onClick={() => onSelectLeague?.({ code: 'LIVE' })}
          icon={<span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          label="Live"
          badge={liveCount > 0 ? liveCount : null}
          badgeColor="emerald"
        />
        <SidebarBtn
          active={activeLeague === 'TODAY'}
          onClick={() => onSelectLeague?.({ code: 'TODAY' })}
          icon="📅"
          label="Today"
        />
        <SidebarBtn
          active={activeLeague === 'TOMORROW'}
          onClick={() => onSelectLeague?.({ code: 'TOMORROW' })}
          icon="📆"
          label="Tomorrow"
        />
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-white/[0.04] my-1" />

      {/* League Groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 max-h-[200px]">
        {LEAGUE_TREE.map(group => {
          const isExpanded = expanded[group.country] ?? false;

          return (
            <div key={group.country} className="mb-0.5">
              <button
                onClick={() => toggle(group.country)}
                className="flex items-center w-full px-2 py-1.5 text-white/30 hover:text-white/50 transition-colors"
              >
                <span className="mr-2 text-sm">{group.flag}</span>
                <span className="flex-1 text-left text-[9px] font-black uppercase tracking-[0.15em]">{group.country}</span>
                <span className={`text-[8px] opacity-30 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}>▼</span>
              </button>

              {isExpanded && group.leagues.map(league => {
                const active = activeLeague === league.code;
                const todayStr = new Date().toDateString();
                const count = (fixtures || []).filter(f =>
                  f.league?.code === league.code &&
                  new Date(f.date).toDateString() === todayStr
                ).length;

                return (
                  <button
                    key={league.code}
                    onClick={() => onSelectLeague?.(league)}
                    className={`flex items-center w-full px-3 py-1.5 pl-8 rounded-md text-xs transition-all ${
                      active
                        ? 'bg-cyan-500/10 text-cyan-400 font-semibold border-l-2 border-cyan-400'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border-l-2 border-transparent'
                    }`}
                  >
                    <span className="flex-1 text-left">{league.name}</span>
                    {count > 0 && (
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400/60 px-1.5 py-0.5 rounded-full font-bold">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarBtn({ active, onClick, icon, label, badge, badgeColor = 'cyan' }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all text-left text-xs ${
        active
          ? 'bg-cyan-500/10 text-white/90 font-semibold'
          : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
      }`}
    >
      <span className="text-sm flex items-center justify-center w-5">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
          badgeColor === 'emerald'
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
            : 'bg-cyan-500/10 text-cyan-400/60'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
