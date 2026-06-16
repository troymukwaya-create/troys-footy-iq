import React from 'react';
import { GlassKickoff, GlassPitch, GlassEdge } from './GlassTabIcons.jsx';
import Dock from './reactbits/Dock.jsx';

// Bottom tab bar as the React Bits Dock — a floating glass dock that
// magnifies on cursor proximity (desktop preview). On touch it sits at base
// size and stays tappable. Mobile-only; desktop uses TopNav + side panels.
export function MobileNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home',    Icon: GlassKickoff, label: 'Home' },
    { id: 'leagues', Icon: GlassPitch,   label: 'Matches' },
    { id: 'ai',      Icon: GlassEdge,    label: 'Edge' },
  ];

  const items = tabs.map(({ id, Icon, label }) => ({
    icon: <Icon size={22} active={activeTab === id} />,
    label,
    onClick: () => onTabChange?.(id),
    className: activeTab === id ? 'dock-item-active' : '',
  }));

  return (
    <div className="mobile-dock-wrap">
      <Dock
        items={items}
        panelHeight={56}
        baseItemSize={44}
        magnification={64}
        distance={120}
        dockHeight={130}
      />
      <style>{`
        .mobile-dock-wrap { display: none; }
        @media (max-width: 768px) {
          .mobile-dock-wrap {
            display: block; position: fixed; left: 0; right: 0; bottom: 0;
            z-index: 100; pointer-events: none;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .mobile-dock-wrap .dock-panel { pointer-events: auto; }
        }
      `}</style>
    </div>
  );
}
