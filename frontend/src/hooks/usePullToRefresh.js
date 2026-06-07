import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight pull-to-refresh for a scrollable element.
 * Engages only when the element is scrolled to the top and the user drags down.
 * Returns a ref to attach to the scroll container + the current pull distance
 * and a refreshing flag for rendering an indicator.
 */
export function usePullToRefresh(onRefresh, { threshold = 70, max = 90 } = {}) {
  const ref = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY = 0;
    let pulling = false;

    const setP = (v) => { pullRef.current = v; setPull(v); };

    const onStart = (e) => {
      if (refreshingRef.current) { pulling = false; return; }
      if (el.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
      else pulling = false;
    };
    const onMove = (e) => {
      if (!pulling || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && el.scrollTop <= 0) {
        const dist = Math.min(dy * 0.5, max);
        setP(dist);
        if (dist > 5 && e.cancelable) e.preventDefault(); // take over the gesture
      } else if (dy < 0) {
        pulling = false;
        setP(0);
      }
    };
    const onEnd = async () => {
      if (!pulling) return;
      pulling = false;
      if (pullRef.current >= threshold) {
        refreshingRef.current = true;
        setRefreshing(true);
        setP(46);
        try { await onRefresh?.(); } catch { /* ignore */ }
        setTimeout(() => { refreshingRef.current = false; setRefreshing(false); setP(0); }, 500);
      } else {
        setP(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [onRefresh, threshold, max]);

  return { ref, pull, refreshing };
}
