import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { AppError, type Handedness, type Landmark, type TrackResult } from "./types";

export interface Tracker { detect(video: HTMLVideoElement, tsMs: number): TrackResult; delegate: "GPU" | "CPU" }
const TASK = "/mediapipe/hand_landmarker.task", WASM = "/mediapipe/wasm";
let p: Promise<Tracker> | null = null;
export const resetTracker = () => { p = null; };

/** MediaPipe HandLandmarker (the same model file the teammate's live script uses), up to two hands. */
export function getTracker(): Promise<Tracker> {
  return (p ??= (async () => {
    const head = await fetch(TASK, { method: "HEAD" }).catch(() => null);
    if (!head || !head.ok)
      throw new AppError("missing_file", "model/hand_landmarker.task", "model/hand_landmarker.task is missing from the project folder.");
    let fileset;
    try { fileset = await FilesetResolver.forVisionTasks(WASM); }
    catch { throw new AppError("missing_file", "mediapipe/wasm", "Missing tracker runtime files in mediapipe/wasm."); }
    let lastErr: unknown;
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const lm = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: TASK, delegate }, runningMode: "VIDEO", numHands: 2,
          minHandDetectionConfidence: 0.35, minHandPresenceConfidence: 0.35, minTrackingConfidence: 0.35,
        });
        return {
          delegate,
          detect(video, ts) {
            const r: any = lm.detectForVideo(video, ts);
            const hands = (r.landmarks ?? []).map((l: any[], i: number) => {
              const cat = (r.handedness ?? r.handednesses)?.[i]?.[0];
              return { landmarks: l.map((q) => [q.x, q.y, q.z] as Landmark), hand: (cat?.categoryName === "Left" ? "Left" : "Right") as Handedness, score: cat?.score ?? 1 };
            });
            return { hands } as TrackResult;
          },
        } as Tracker;
      } catch (e) { lastErr = e; }
    }
    throw new AppError("tracker", "mediapipe/hand_landmarker.task", `Tracker failed to start: ${String((lastErr as Error)?.message ?? lastErr)}`);
  })().catch((e) => { p = null; throw e; }));
}
