import type { Gate } from "./gate";
import { predictFrame, type Mode } from "./api";
import type { Tracker } from "./tracker";
import type { GateOutput, Landmark, TrackHand } from "./types";

export interface FrameInfo {
  t: number; hands: TrackHand[]; probs: number[] | null; gate: GateOutput | null; fps: number; buffered: number;
  ms: { track: number; server: number; total: number };
  brightness: number;            // mean video luma 0-255, sampled every 10 frames
  handSize: number | null;       // wrist to middle knuckle, image-width units (for the test's distance analysis)
}
export const CONNECTIONS: [number, number][] = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export interface HeadSpec { labels: string[]; threshold: number }
export interface EngineOpts {
  video: HTMLVideoElement | null; canvas: HTMLCanvasElement | null; tracker: Tracker; gate: Gate; mode: Mode; smooth: number;
  heads: Record<string, HeadSpec>; labels: string[];        // labels: every sign in backend order
  skeleton: () => boolean; onFrame?: (f: FrameInfo) => void; onCommit?: (label: string, g: GateOutput) => void;
}

/** Where each sign lives: which model, and its position in that model's output. */
export function buildSlots(labels: string[], heads: Record<string, HeadSpec>): { head: string; j: number }[] {
  return labels.map((key) => {
    for (const [head, spec] of Object.entries(heads)) { const j = spec.labels.indexOf(key); if (j >= 0) return { head, j }; }
    return { head: "", j: -1 };
  });
}

/**
 * The combined decision for one frame, as training/live_clean.py makes it.
 * histories: the last few probability vectors of each model. Returns one value per sign (0 = not counted),
 * or null while no model has a full smoothing window yet.
 */
export function combine(labels: string[], heads: Record<string, HeadSpec>, slots: { head: string; j: number }[],
                        histories: Record<string, Float64Array[]>, active: Set<string>, smooth: number): Float64Array | null {
  const avg: Record<string, Float64Array> = {};
  let anyFull = false;
  for (const h of Object.keys(heads)) {
    const rows = histories[h] ?? [];
    if (active.has(h) && rows.length >= smooth) {
      anyFull = true;
      const a = new Float64Array(rows[0].length);
      for (const r of rows) for (let i = 0; i < r.length; i++) a[i] += r[i] / rows.length;
      avg[h] = a;
    }
  }
  if (!anyFull) return null;
  const out = new Float64Array(labels.length);
  slots.forEach((s, i) => {
    if (!avg[s.head]) return;
    const p = avg[s.head][s.j];
    out[i] = p >= heads[s.head].threshold ? p : 0;      // below the model's own threshold: not counted
  });
  return out;
}

/**
 * Per-frame loop, the same rules as training/live_clean.py in combined mode:
 *  - MediaPipe finds the hand points in the browser; the backend runs all three classifiers on them.
 *  - each classifier is averaged over the last `smooth` frames;
 *  - a classifier's sign counts only if its average reaches that classifier's own threshold;
 *  - the most confident counted sign across the three classifiers is passed to the gate, which requires it to be
 *    the same for `stable` frames and held for the hold time before it is added to the sentence.
 */
export class Engine {
  private raf = 0; private running = false; private lastVT = -1; private fpsT = performance.now(); private fpsN = 0; private fps = 0; private lastTs = 0;
  private inflight = false; private hist: Record<string, Float64Array[]> = {};
  private slots: { head: string; j: number }[];
  private active: Set<string>;
  constructor(private o: EngineOpts) {
    this.active = new Set(o.mode === "all" ? Object.keys(o.heads) : [o.mode]);
    this.slots = buildSlots(o.labels, o.heads);
    for (const h of Object.keys(o.heads)) this.hist[h] = [];
  }
  start() { if (this.running) return; this.running = true; for (const h of Object.keys(this.hist)) this.hist[h] = []; this.o.gate.reset(); this.loop(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); const c = this.o.canvas; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }

  private combined(): Float64Array | null {
    return combine(this.o.labels, this.o.heads, this.slots, this.hist, this.active, this.o.smooth);
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const { video, tracker, gate } = this.o;
    if (!video || video.readyState < 2 || video.currentTime === this.lastVT) return;
    this.lastVT = video.currentTime;
    this.frameNo++;
    if (this.frameNo % 10 === 1) this.bright = this.sampleBrightness(video);
    const now = performance.now();
    const ts = Math.max(now, this.lastTs + 1); this.lastTs = ts;
    let hands: TrackHand[] = [];
    try { hands = tracker.detect(video, ts).hands; } catch { hands = []; }
    const tTrack = performance.now() - now;

    if (!hands.length) for (const h of Object.keys(this.hist)) this.hist[h] = [];
    else if (!this.inflight) {
      this.inflight = true;
      const aspect = (video.videoWidth || 640) / (video.videoHeight || 480);   // camera frame width / height
      const t0 = performance.now();
      predictFrame(hands.map((h) => h.landmarks as Landmark[]), aspect)
        .then((r) => {
          this.serverMs = performance.now() - t0;
          for (const h of Object.keys(this.hist)) {
            const res = r.heads[h];
            if (res?.probs) { this.hist[h].push(Float64Array.from(res.probs)); if (this.hist[h].length > this.o.smooth) this.hist[h].shift(); }
            else this.hist[h] = [];
          }
        })
        .catch(() => { for (const h of Object.keys(this.hist)) this.hist[h] = []; })
        .finally(() => { this.inflight = false; });
    }
    const probs = this.combined();
    const g = gate.update(now, hands.length > 0, probs);
    if (g.committed) this.o.onCommit?.(g.committed, g);

    this.fpsN++;
    if (now - this.fpsT >= 1000) { this.fps = (this.fpsN * 1000) / (now - this.fpsT); this.fpsN = 0; this.fpsT = now; }
    this.draw(hands, g);
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const handSize = hands[0] ? Math.hypot(hands[0].landmarks[9][0] - hands[0].landmarks[0][0], (hands[0].landmarks[9][1] - hands[0].landmarks[0][1]) * vh / vw) : null;
    const windowLen = Math.max(0, ...Object.values(this.hist).map((r) => r.length));
    this.o.onFrame?.({ t: now, hands, probs: probs ? Array.from(probs) : null, gate: g, fps: this.fps, buffered: windowLen,
      ms: { track: tTrack, server: this.serverMs, total: performance.now() - now }, brightness: this.bright, handSize });
  };
  private serverMs = 0;
  private frameNo = 0; private bright = 0; private bcv: HTMLCanvasElement | null = null;

  private sampleBrightness(v: HTMLVideoElement): number {
    if (!this.bcv) { this.bcv = document.createElement("canvas"); this.bcv.width = 32; this.bcv.height = 24; }
    const ctx = this.bcv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return this.bright;
    ctx.drawImage(v, 0, 0, 32, 24);
    const d = ctx.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4);
  }

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

