import type { TrackHand } from "../lib/types";

export interface TrackerFrame { hands: TrackHand[]; aspect: number; brightness: number; handSize: number | null }

/**
 * On-phone hand tracking. Turns camera frames into 21 points per hand (MediaPipe HandLandmarker, the same model
 * as the web app and training/live_clean.py). This is the one piece that needs a native build, so it is not
 * included yet. While it is null, the app shows the camera and says recognition is not available in this build.
 * To add it: implement HandTracker with a native module and export it here.
 */
export interface HandTracker {
  /** Starts sending frames. Returns a function that stops it. */
  start(onFrame: (f: TrackerFrame) => void): () => void;
}

export const handTracker: HandTracker | null = null;
