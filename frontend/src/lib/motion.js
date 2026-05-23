// ─── MOTION VOCABULARY ──────────────────────────────────────────────
// A small, opinionated set of motion presets. Use these everywhere
// instead of one-off transition objects. Consistency > novelty.
//
// Philosophy: animate the *value moments*, not every mount/unmount.
// A flat UI that doesn't move is better than a UI that wiggles
// for no reason.
// ────────────────────────────────────────────────────────────────────

// Entrances — cards, panels, anything that mounts into view
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring', damping: 24, stiffness: 280, mass: 0.7 },
};

// Stagger child of `enter` — for lists where items appear in sequence
export const enterStagger = (i = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: {
    type: 'spring', damping: 24, stiffness: 280,
    delay: i * 0.04,
  },
});

// Snap — selections, toggles, anything tactile
export const snap = {
  type: 'spring',
  damping: 18,
  stiffness: 420,
  mass: 0.6,
};

// Number roll — odds changing, probabilities updating, Brier score ticking
// Use with motion's animate() on a numeric value, or as transition prop
export const numberRoll = {
  duration: 0.7,
  ease: [0.16, 1, 0.3, 1], // expo-out
};

// Bar fill — probability bars, edge meters, anything horizontal
export const barFill = {
  duration: 0.9,
  ease: [0.22, 1, 0.36, 1], // expo-out, slower
};

// Pulse flash — value moments: goal scored, edge detected, score updated
// Apply via animate prop with a sequence
export const pulseFlash = {
  scale:   [1, 1.05, 1],
  opacity: [1, 1, 1],
  transition: { duration: 0.45, times: [0, 0.3, 1], ease: 'easeOut' },
};

// Hover-lift — cards on hover (use with whileHover)
export const hoverLift = {
  y: -2,
  transition: { type: 'spring', damping: 22, stiffness: 320 },
};

// Page transition — for route changes (pair with AnimatePresence)
export const pageEnter = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
};
