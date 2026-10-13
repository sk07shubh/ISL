/** Timing rules, the same values as the backend and training/live_clean.py. */
export const GATE = {
  smooth: 8,        // frames averaged per model (live_clean.py --smooth 8)
  stable: 5,        // frames the same top sign must hold (STABLE_FRAMES)
  hold_ms: 600,     // time held before a sign is added to the sentence
  release_ms: 300,  // time the hand must leave before the same sign can be added again
};
