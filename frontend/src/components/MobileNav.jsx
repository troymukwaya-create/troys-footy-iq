import React from 'react';
import { Home, Trophy, Zap } from 'lucide-react';
import { motion } from 'motion/react';

export function MobileNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home',    Icon: Home,   label: 'Home' },
    { id: 'leagues', Icon: Trophy, label: 'Matches' },
    { id: 'ai',      Icon: Zap,    label: 'Edge' },
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
            className="relative flex flex-col items-center justify-center w-1/3 h-full cursor-pointer"
            style={{ color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.28)', background: 'none', border: 'none' }}
          >
            {/* Sliding active pill — animates smoothly between tabs */}
            {isActive && (
              <motion.span
                layoutId="mobileNavPill"
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                style={{ position: 'absolute', top: 7, width: 44, height: 30, borderRadius: 10, background: 'var(--accent-muted)' }}
              />
            )}
            <motion.span
              animate={{ scale: isActive ? 1.08 : 1, y: isActive ? -1 : 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 340 }}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="mt-0.5" style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
                {label}
              </span>
            </motion.span>
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
