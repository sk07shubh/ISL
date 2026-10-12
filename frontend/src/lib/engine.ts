import { buildFeatures, VARIANTS, type SignLensModel } from "./signlens";
import type { Gate } from "./gate";
import type { Tracker } from "./tracker";
import type { GateOutput, Landmark, TrackHand } from "./types";

export interface FrameInfo {
  t: number; hands: TrackHand[]; feats: Float32Array | null; probs: Float64Array | null; gate: GateOutput | null;
  ms: { track: number; feat: number; model: number; total: number }; fps: number;
}
export const CONNECTIONS: [number, number][] = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export interface EngineOpts {
  video: HTMLVideoElement | null; canvas: HTMLCanvasElement | null; tracker: Tracker; model: SignLensModel; gate: Gate;
  variant: () => number; skeleton: () => boolean; onFrame?: (f: FrameInfo) => void; onCommit?: (label: string, g: GateOutput) => void;
}

/** Per-frame pipeline: tracker -> features (156) -> SignLens MLP -> confidence gate. Runs from refs; React reads 10 snapshots/s. */
export class Engine {
  private raf = 0; private running = false; private lastVT = -1; private fpsT = performance.now(); private fpsN = 0; private fps = 0; private lastTs = 0;
  constructor(private o: EngineOpts) {}
  start() { if (this.running) return; this.running = true; this.o.gate.reset(); this.loop(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); const c = this.o.canvas; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const { video, tracker, model, gate } = this.o;
    if (!video || video.readyState < 2 || video.currentTime === this.lastVT) return;
    this.lastVT = video.currentTime;
    const now = performance.now();
    let hands: TrackHand[] = [];
    try { hands = tracker.detect(video, Math.max(now, this.lastTs + 1)).hands; } catch { hands = []; }
    this.lastTs = Math.max(now, this.lastTs + 1);
    const t1 = performance.now();
    const feats = buildFeatures(hands, VARIANTS[this.o.variant()] ?? VARIANTS[0]);
    const t2 = performance.now();
    const probs = feats ? model.predict(feats) : null;
    const t3 = performance.now();
    const g = gate.update(now, hands.length > 0, probs);
    if (g.committed) this.o.onCommit?.(g.committed, g);
    this.fpsN++;
    if (now - this.fpsT >= 1000) { this.fps = (this.fpsN * 1000) / (now - this.fpsT); this.fpsN = 0; this.fpsT = now; }
    this.draw(hands, g);
    this.o.onFrame?.({ t: now, hands, feats, probs, gate: g, fps: this.fps, ms: { track: t1 - now, feat: t2 - t1, model: t3 - t2, total: performance.now() - now } });
  };

  private draw(hands: TrackHand[], g: GateOutput) {
    const c = this.o.canvas; if (!c) return;
    const dpr = window.devicePixelRatio || 1, cw = Math.round(c.clientWidth * dpr), ch = Math.round(c.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, cw, ch);
    if (!hands.length || !this.o.skeleton()) return;
    const v = this.o.video, vw = v?.videoWidth || 640, vh = v?.videoHeight || 480;
    const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;   // object-fit: cover
    const px = (p: Landmark): [number, number] => [p[0] * vw * s + ox, p[1] * vh * s + oy];
    const line = g.state === "recognised" ? "#059669" : g.state === "uncertain" ? "#D97706" : "#4F46E5";
    for (const h of hands) {
      ctx.lineWidth = 2.5 * dpr; ctx.lineCap = "round"; ctx.strokeStyle = line; ctx.globalAlpha = 0.85;
      for (const [a, b] of CONNECTIONS) { const [x1, y1] = px(h.landmarks[a]), [x2, y2] = px(h.landmarks[b]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (const p of h.landmarks) { const [x, y] = px(p); ctx.beginPath(); ctx.arc(x, y, 4.5 * dpr, 0, 6.2832); ctx.fillStyle = "#0D9488"; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    }
  }
}
