import { combine, buildSlots, type HeadSpec, type Slot } from "./combine";
import { Gate } from "./gate";
import { predictFrame, type Landmark, type Mode } from "./api";
import type { GateOutput, ModelInfo, TrackHand } from "./types";

export interface RecognizerFrame { gate: GateOutput; probs: number[] | null; buffered: number; serverMs: number }

/**
 * The phone-side recogniser. It receives hand points from the tracker, asks the backend for the three classifiers,
 * and runs the same smoothing, threshold, stability and hold rules as the web app.
 * It has no camera or DOM code, so it can be unit-tested and reused.
 */
export class Recognizer {
  private hist: Record<string, Float64Array[]> = {};
  private slots: Slot[];
  private active: Set<string>;
  private inflight = false;
  private lastServerMs = 0;
  private gate: Gate;

  constructor(private info: ModelInfo, mode: Mode) {
    this.active = new Set(mode === "all" ? Object.keys(info.heads) : [mode]);
    this.heads = Object.fromEntries(Object.entries(info.heads).map(([k, h]) => [k, { labels: h.labels, threshold: h.threshold }])) as Record<string, HeadSpec>;
    this.slots = buildSlots(info.labels, this.heads);
    for (const h of Object.keys(this.heads)) this.hist[h] = [];
    const minThreshold = Math.min(...Object.values(this.heads).map((h) => h.threshold));
    this.gate = new Gate(info.labels, { min_prob: minThreshold, min_margin: 0, smoothing_window: info.gate.stable, smoothing_agree: 1, hold_ms: info.gate.hold_ms, release_ms: info.gate.release_ms }, "__none__");
  }
  private heads: Record<string, HeadSpec>;

  setMode(mode: Mode) {
    this.active = new Set(mode === "all" ? Object.keys(this.info.heads) : [mode]);
    this.reset();
  }

  reset() { for (const h of Object.keys(this.hist)) this.hist[h] = []; this.gate.reset(); }

  /** Call once per camera frame with that frame's hand points (or [] if none). Returns the state to show. */
  async push(hands: TrackHand[], aspect: number, now: number): Promise<RecognizerFrame> {
    if (!hands.length) {
      for (const h of Object.keys(this.hist)) this.hist[h] = [];
    } else if (!this.inflight) {
      this.inflight = true;
      const t0 = Date.now();
      try {
        const r = await predictFrame(hands.map((h) => h.landmarks as Landmark[]), aspect);
        this.lastServerMs = Date.now() - t0;
        for (const h of Object.keys(this.hist)) {
          const res = r.heads[h];
          if (res?.probs) { this.hist[h].push(Float64Array.from(res.probs)); if (this.hist[h].length > this.info.gate.smooth) this.hist[h].shift(); }
          else this.hist[h] = [];
        }
      } catch {
        for (const h of Object.keys(this.hist)) this.hist[h] = [];
      } finally {
        this.inflight = false;
      }
    }
    const probs = combine(this.info.labels, this.heads, this.slots, this.hist, this.active, this.info.gate.smooth);
    const gate = this.gate.update(now, hands.length > 0, probs);
    const buffered = Math.max(0, ...Object.values(this.hist).map((r) => r.length));
    return { gate, probs: probs ? Array.from(probs) : null, buffered, serverMs: this.lastServerMs };
  }
}
