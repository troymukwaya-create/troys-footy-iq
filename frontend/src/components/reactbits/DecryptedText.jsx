import React, { useEffect, useRef, useState } from 'react';

// Terminal scramble → resolve. Matches the "> read the game_" motif. It
// RESOLVES to clean (unlike glitch effects that stay broken — wrong signal
// for a reliability brand). Use once, as a hero beat. Reduced-motion shows
// the final text immediately.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/\\|=+*·';

export default function DecryptedText({ text, className, style, speed = 36, revealEvery = 2, startDelay = 120 }) {
  const [out, setOut] = useState(text);
  const ref = useRef(null);
  const started = useRef(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const run = () => {
      if (started.current) return;
      started.current = true;
      if (reduce) { setOut(text); return; }
      let frame = 0;
      intervalRef.current = setInterval(() => {
        frame++;
        const revealed = Math.floor(frame / revealEvery);
        setOut(text.split('').map((ch, i) => (i < revealed || ch === ' ') ? ch : CHARS[Math.floor(Math.random() * CHARS.length)]).join(''));
        if (revealed >= text.length) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setOut(text);
        }
      }, speed);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && !started.current) {
        io.disconnect();
        timeoutRef.current = setTimeout(run, startDelay);
      }
    }), { threshold: 0.5 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [text]);

  return <span ref={ref} className={className} style={style}>{out}</span>;
}
