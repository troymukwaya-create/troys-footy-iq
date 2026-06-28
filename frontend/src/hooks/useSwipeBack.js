import { useEffect } from 'react';

/**
 * Edge swipe-to-go-back (mobile). A rightward drag that STARTS near the left
 * screen edge fires onBack() — the iOS-style interactive back gesture, so the
 * app's URL-param navigation (?match / ?team / ?tab / league filter) can be
 * undone with a thumb. Pair with a contextual onBack so it never walks the
 * user out of the app.
 *
 * Constrained to the left edge and cancelled on vertical movement, so it never
 * fights the fixture list's scrolling or pull-to-refresh.
 */
export function useSwipeBack(onBack, { edge = 30, threshold = 72 } = {}) {
  useEffect(() => {
    let startX = 0, startY = 0, tracking = false;

    const onStart = (e) => {
      const t = e.touches[0];
      if (t && t.clientX <= edge) { startX = t.clientX; startY = t.clientY; tracking = true; }
      else tracking = false;
    };
    const onMove = (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX, dy = t.clientY - startY;
      // Clearly a vertical scroll → bail out so we don't hijack it.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 24) tracking = false;
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (dx >= threshold && Math.abs(dy) < dx) onBack?.();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onBack, edge, threshold]);
}
