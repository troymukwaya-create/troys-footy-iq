import React from 'react';

export function MobileNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'today', icon: '🏠', label: 'Today' },
    { id: 'leagues', icon: '🏆', label: 'Leagues' },
    { id: 'match', icon: '⚽', label: 'Match' },
    { id: 'ai', icon: '🧠', label: 'AI' },
  ];

  return (
    <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 h-14 bg-[#0a0e1a]/95 backdrop-blur-xl border-t border-white/[0.04] hidden justify-around items-center z-[100]">
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            className={`flex flex-col items-center justify-center w-1/4 h-full cursor-pointer transition-colors ${
              isActive ? 'text-cyan-400' : 'text-white/25'
            }`}
          >
            <span className="text-lg mb-0.5">{tab.icon}</span>
            <span className={`text-[9px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
          </div>
        );
      })}

      <style>{`
        @media (max-width: 768px) {
          .mobile-bottom-nav { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
