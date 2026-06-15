import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GlassKickoff, GlassPitch, GlassEdge } from './GlassTabIcons.jsx';

// Frosted glass bottom bar. The page scrolls visibly underneath; while the
// user is actively scrolling the bar dissolves to nearly clear (more glass,
// content flowing under it), then settles back to a readable frost at rest.
export function MobileNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home',    Icon: GlassKickoff, label: 'Home' },
    { id: 'leagues', Icon: GlassPitch,   label: 'Matches' },
    { id: 'ai',      Icon: GlassEdge,    label: 'Edge' },
  ];

  // "more transparent when I scroll": true while a scroll is in flight.
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let t;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 480);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(t); };
  }, []);

  return (
    <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 hidden justify-around items-center z-[100]"
      style={{
        height: 'calc(58px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        // Frosted glass — dissolves to near-clear while scrolling.
        background: scrolling ? 'rgba(11,11,13,0.18)' : 'rgba(11,11,13,0.64)',
        backdropFilter: `blur(${scrolling ? 34 : 22}px) saturate(1.8)`,
        WebkitBackdropFilter: `blur(${scrolling ? 34 : 22}px) saturate(1.8)`,
        // A single hairline of light along the top edge — the Apple tell.
        borderTop: '1px solid rgba(255,255,255,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'background 380ms ease, backdrop-filter 380ms ease, -webkit-backdrop-filter 380ms ease',
      }}>
      {tabs.map(({ id, Icon, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange?.(id)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className="relative flex flex-col items-center justify-center w-1/3 h-full cursor-pointer"
            style={{ color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.34)', background: 'none', border: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {/* Frosted glass lozenge — slides between tabs */}
            {isActive && (
              <motion.span
                layoutId="mobileNavPill"
                transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                style={{
                  position: 'absolute', top: 6, width: 50, height: 34, borderRadius: 12,
                  background: 'rgba(168,52,74,0.20)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 16px rgba(0,0,0,0.34)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}
              />
            )}
            <motion.span
              animate={{ scale: isActive ? 1.06 : 1, y: isActive ? -1 : 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 340 }}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                filter: isActive ? 'drop-shadow(0 1px 6px rgba(168,52,74,0.45))' : 'none' }}
            >
              <Icon size={22} active={isActive} />
              <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 500, fontFamily: 'var(--font-body)', letterSpacing: '0.04em', opacity: isActive ? 1 : 0.9 }}>
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
