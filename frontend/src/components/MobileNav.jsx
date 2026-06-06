import React from 'react';
import { Home, Trophy, BarChart2, Brain } from 'lucide-react';

export function MobileNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home',    Icon: Home,      label: 'Home' },
    { id: 'leagues', Icon: Trophy,    label: 'Leagues' },
    { id: 'match',   Icon: BarChart2, label: 'Match' },
    { id: 'ai',      Icon: Brain,     label: 'AI' },
  ];

  return (
    <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t hidden justify-around items-center z-[100]"
      style={{
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(11,11,13,0.96)',
        borderColor: 'var(--border-subtle)',
      }}>
      {tabs.map(({ id, Icon, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange?.(id)}
            className="flex flex-col items-center justify-center w-1/4 h-full cursor-pointer transition-colors"
            style={{ color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.25)', background: 'none', border: 'none' }}
          >
            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
            <span className="mt-0.5" style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
              {label}
            </span>
          </button>
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
