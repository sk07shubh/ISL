import { combine, buildSlots, type HeadSpec, type Slot } from "./combine";
import { Gate } from "./gate";
import { classifyAll } from "./onDevice";
import { HEADS, type HeadName } from "./onDevice";
import { GATE } from "./config";
import { LABELS } from "./vocab";
import type { Hand } from "./features";
import type { GateOutput } from "./types";
import type { Mode } from "./api";

export interface RecognizerFrame { gate: GateOutput; probs: number[] | null; buffered: number }

const specs: Record<string, HeadSpec> = Object.fromEntries((Object.keys(HEADS) as HeadName[]).map((n) => [n, { labels: HEADS[n].labels, threshold: HEADS[n].threshold }]));
const slots: Slot[] = buildSlots(LABELS, specs);
const minThreshold = Math.min(...Object.values(specs).map((s) => s.threshold));

/**
 * The phone-side recogniser. All computation happens on the device, synchronously, once per camera frame:
 * features -> three classifiers -> smoothing -> thresholds -> stability -> hold. Same rules as the website.
 */
export class Recognizer {
  private hist: Record<string, Float64Array[]> = {};
  private active: Set<string>;
  private gate: Gate;

  constructor(mode: Mode) {
    this.active = new Set(mode === "all" ? Object.keys(HEADS) : [mode]);
    for (const h of Object.keys(specs)) this.hist[h] = [];
    this.gate = new Gate(LABELS, { min_prob: minThreshold, min_margin: 0, smoothing_window: GATE.stable, smoothing_agree: 1, hold_ms: GATE.hold_ms, release_ms: GATE.release_ms }, "__none__");
  }

  setMode(mode: Mode) {
    this.active = new Set(mode === "all" ? Object.keys(HEADS) : [mode]);
    this.reset();
  }

  reset() { for (const h of Object.keys(this.hist)) this.hist[h] = []; this.gate.reset(); }

  /** One camera frame: its hand points (raw MediaPipe, 21 points each) and the frame's width/height. */
  process(hands: Hand[], frameAspect: number, now: number): RecognizerFrame {
    if (hands.length === 0) {
      for (const h of Object.keys(this.hist)) this.hist[h] = [];
    } else {
      const out = classifyAll(hands, frameAspect);
      for (const h of Object.keys(this.hist)) {
        const p = out[h as HeadName];
        if (p) { this.hist[h].push(p); if (this.hist[h].length > GATE.smooth) this.hist[h].shift(); }
        else this.hist[h] = [];
      }
    }
    const probs = combine(LABELS, specs, slots, this.hist, this.active, GATE.smooth);
    const gate = this.gate.update(now, hands.length > 0, probs);
    return { gate, probs: probs ? Array.from(probs) : null, buffered: Math.max(0, ...Object.values(this.hist).map((r) => r.length)) };
  }
}
