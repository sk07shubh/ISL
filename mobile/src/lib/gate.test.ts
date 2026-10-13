import { describe, it, expect } from "vitest";
import { Gate } from "./gate";

const labels = ["a", "b", "c"];
const cfg = { min_prob: 0.8, min_margin: 0, smoothing_window: 1, smoothing_agree: 1, hold_ms: 600, release_ms: 300 };
const P = (a: number, b: number, c: number) => [a, b, c];
const run = (g: Gate, t0: number, n: number, step: number, probs: number[] | null, hand = true) => { let o; for (let i = 0; i < n; i++) o = g.update(t0 + i * step, hand, probs); return o!; };

describe("gate", () => {
  it("no hand -> no_hand, no word", () => { const o = new Gate(labels, cfg, "__none__").update(0, false, null); expect(o.state).toBe("no_hand"); expect(o.label).toBeNull(); });
  it("below threshold -> uncertain, no word", () => { const o = run(new Gate(labels, cfg, "__none__"), 0, 6, 50, P(0.6, 0.3, 0.1)); expect(o.state).toBe("uncertain"); expect(o.label).toBeNull(); expect(o.reason).toBe("low_prob"); });
  it("window not full yet -> uncertain (no guess)", () => { expect(new Gate(labels, cfg, "__none__").update(0, true, null).reason).toBe("rejected"); });
  it("commits once after hold, then not again until the hand leaves", () => {
    const g = new Gate(labels, cfg, "__none__"); const commits: string[] = [];
    for (let i = 0; i < 60; i++) { const o = g.update(i * 50, true, P(0.95, 0.03, 0.02)); if (o.committed) commits.push(o.committed); }
    expect(commits).toEqual(["a"]);
    for (let i = 60; i < 70; i++) g.update(i * 50, false, null);
    for (let i = 70; i < 130; i++) { const o = g.update(i * 50, true, P(0.95, 0.03, 0.02)); if (o.committed) commits.push(o.committed); }
    expect(commits).toEqual(["a", "a"]);
  });
  it("a different sign commits without leaving", () => {
    const g = new Gate(labels, cfg, "__none__"); const c: string[] = [];
    for (let i = 0; i < 40; i++) { const o = g.update(i * 50, true, P(0.95, 0.03, 0.02)); if (o.committed) c.push(o.committed); }
    for (let i = 40; i < 120; i++) { const o = g.update(i * 50, true, P(0.03, 0.95, 0.02)); if (o.committed) c.push(o.committed); }
    expect(c).toEqual(["a", "b"]);
  });
});
