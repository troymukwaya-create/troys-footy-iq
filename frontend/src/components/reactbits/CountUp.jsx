import React, { useLayoutEffect, useRef } from 'react';

// Counts a number up to its value when it scrolls into view, and re-animates
// from the current value to a new one if the value later changes (live data).
// Tuned for the brand: tabular monospace numerals, easeOutCubic,
// reduced-motion aware. rAF is always cancelled on unmount / re-animate.
//
// IMPORTANT: the tween writes straight to the DOM node (ref.textContent) and
// NEVER calls setState. An earlier version setState'd ~60×/sec, which re-rendered
// the React tree every frame and made the Brier hero flicker while the numbers
// counted (it ran alongside DecryptedText + the DotGrid). The span is rendered
// childless so React never reconciles its text and fights these writes.
export default function CountUp({ value, decimals = 0, duration = 1200, prefix = '', suffix = '', className, style }) {
  const ref = useRef(null);
  const inView = useRef(false);
  const rafRef = useRef(null);
  const displayRef = useRef(0); // current animated value — survives re-renders

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const target = Number(value) || 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const write = (v) => { if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`; };

    const animate = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (reduce) { displayRef.current = target; write(target); return; }
      const from = displayRef.current;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = from + (target - from) * eased;
        displayRef.current = v;
        write(v);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          displayRef.current = target;
          write(target);
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Paint a correct value immediately (before the browser paints), so there's
    // never a blank frame: the current animated value if we're mid-life, else 0.
    write(inView.current ? displayRef.current : 0);

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
  }, [value, duration, decimals, prefix, suffix]);

  // Childless on purpose — text is written imperatively (see note above).
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }} />
  );
}
