import React, { useEffect, useRef, useState } from 'react';

// Counts a number up to its value when it scrolls into view, and re-animates
// from the current value to a new one if the value later changes (live data).
// Tuned for the brand: tabular monospace numerals, easeOutCubic,
// reduced-motion aware. rAF is always cancelled on unmount / re-animate.
export default function CountUp({ value, decimals = 0, duration = 1200, prefix = '', suffix = '', className, style }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const inView = useRef(false);
  const rafRef = useRef(null);
  const displayRef = useRef(0); // current animated value — survives re-renders, no stale closure

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const target = Number(value) || 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (reduce) { displayRef.current = target; setDisplay(target); return; }
      const from = displayRef.current;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = from + (target - from) * eased;
        displayRef.current = v;
        setDisplay(v);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          displayRef.current = target;
          setDisplay(target);
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Already on screen (e.g. the value changed) → animate straight to it.
    if (inView.current) {
      animate();
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && !inView.current) { inView.current = true; io.disconnect(); animate(); }
    }), { threshold: 0.35 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
