import type { GateConfig, GateOutput, UncertainReason } from "./types";

/**
 * Confidence gate (plan section 5). Pure and time-injectable, so it is unit-tested.
 * A sign is shown only if ALL rules pass: min_prob, min_margin, not "other", and the same
 * label won the last `smoothing_window` frames (>= smoothing_agree of them). Then it must
 * be held for hold_ms to commit; after committing the hand must change or leave for
 * release_ms before the same sign can commit again.
 */
export class Gate {
  private hist: number[] = [];
  private holdLabel: string | null = null;
  private holdStart = 0;
  private lockedLabel: string | null = null;
  private releaseSince: number | null = null;

  constructor(private labels: string[], public cfg: GateConfig, private otherKey = "other") {}

  reset() { this.hist = []; this.holdLabel = null; this.lockedLabel = null; this.releaseSince = null; }

  update(tMs: number, handPresent: boolean, probs: ArrayLike<number> | null): GateOutput {
    const base = { holdMs: this.cfg.hold_ms, committed: null as string | null };
    if (!handPresent) {
      this.hist = []; this.holdLabel = null;
      this.trackRelease(tMs, true);
      return { ...base, state: "no_hand", label: null, confidence: 0, margin: 0, top: [], holdProgress: 0, locked: this.lockedLabel !== null };
    }
    if (!probs) {
      this.hist = []; this.holdLabel = null;
      this.trackRelease(tMs, true);
      return { ...base, state: "uncertain", reason: "rejected", label: null, confidence: 0, margin: 0, top: [], holdProgress: 0, locked: this.lockedLabel !== null };
    }
    const order = Array.from({ length: probs.length }, (_, i) => i).sort((a, b) => probs[b] - probs[a]);
    const top = order.slice(0, 3).map((i) => ({ label: this.labels[i], prob: probs[i] }));
    const i1 = order[0];
    const p1 = probs[i1], p2 = probs[order[1]] ?? 0;
    this.hist.push(i1);
    if (this.hist.length > this.cfg.smoothing_window) this.hist.shift();

    let reason: UncertainReason | undefined;
    if (p1 < this.cfg.min_prob) reason = "low_prob";
    else if (p1 - p2 < this.cfg.min_margin) reason = "low_margin";
    else if (this.labels[i1] === this.otherKey) reason = "other_class";
    else {
      const agree = this.hist.filter((h) => h === i1).length;
      if (this.hist.length < this.cfg.smoothing_window || agree / this.hist.length < this.cfg.smoothing_agree) reason = "unstable";
    }

    if (reason) {
      this.holdLabel = null;
      this.trackRelease(tMs, true);
      return { ...base, state: "uncertain", reason, label: null, confidence: p1, margin: p1 - p2, top, holdProgress: 0, locked: this.lockedLabel !== null };
    }

    const label = this.labels[i1];
    this.trackRelease(tMs, this.lockedLabel !== null && label !== this.lockedLabel);
    if (this.holdLabel !== label) { this.holdLabel = label; this.holdStart = tMs; }
    let progress = Math.min(1, (tMs - this.holdStart) / this.cfg.hold_ms);
    let committed: string | null = null;
    if (this.lockedLabel === label) {
      progress = 1;
    } else if (progress >= 1) {
      committed = label; this.lockedLabel = label; this.releaseSince = null;
    }
    return { ...base, state: "recognised", label, confidence: p1, margin: p1 - p2, top, holdProgress: progress, committed, locked: this.lockedLabel !== null };
  }

  /** `away` = this frame is no hand / not recognised / a different sign than the committed one. */
  private trackRelease(tMs: number, away: boolean) {
    if (this.lockedLabel === null) return;
    if (!away) { this.releaseSince = null; return; }
    if (this.releaseSince === null) this.releaseSince = tMs;
    if (tMs - this.releaseSince >= this.cfg.release_ms) { this.lockedLabel = null; this.releaseSince = null; }
  }
}

export function reasonText(r?: UncertainReason): string {
  switch (r) {
    case "low_prob": return "Not sure yet — adjust your hand";
    case "low_margin": return "Two signs look alike — adjust your hand";
    case "other_class": return "Not one of the known signs";
    case "unstable": return "Hold steady…";
    case "rejected": return "Hand too small or unclear — move closer";
    default: return "Adjust your hand";
  }
}
