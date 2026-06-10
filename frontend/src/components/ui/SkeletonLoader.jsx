import React, { useEffect, useState } from 'react';

// After `delayMs` of continuous loading, explain the wait instead of leaving
// the user staring at pulse bars — the backend cold-starts in ~15-30s and an
// unexplained long skeleton reads as "broken".
export function ColdStartNote({ delayMs = 6000 }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!show) return null;
  return (
    <div className="animate-fade-in" style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
      Warming up the engine — first load after a quiet spell takes a few extra seconds…
    </div>
  );
}

export function SkeletonLine({ width = '100%', height = '16px', className = '' }) {
  return (
    <div
      style={{ width, height }}
      className={`animate-pulse rounded bg-white/5 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/5 p-4 flex flex-col gap-4 animate-pulse" style={{ background: 'var(--bg-surface)' }}>
      <div className="flex justify-between items-center">
        <SkeletonLine width="30%" height="12px" />
        <SkeletonLine width="20%" height="12px" />
      </div>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <SkeletonLine width="24px" height="24px" className="rounded-full" />
          <SkeletonLine width="100px" height="16px" />
        </div>
        <SkeletonLine width="20px" height="20px" />
      </div>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <SkeletonLine width="24px" height="24px" className="rounded-full" />
          <SkeletonLine width="100px" height="16px" />
        </div>
        <SkeletonLine width="20px" height="20px" />
      </div>
      <div className="mt-2 flex gap-2">
        <SkeletonLine width="33%" height="28px" className="rounded-lg" />
        <SkeletonLine width="33%" height="28px" className="rounded-lg" />
        <SkeletonLine width="33%" height="28px" className="rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex justify-between items-end">
        <SkeletonLine width="150px" height="24px" />
        <SkeletonLine width="80px" height="14px" />
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <ColdStartNote />
    </div>
  );
}
