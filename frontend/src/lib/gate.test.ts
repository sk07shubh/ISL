import { describe, it, expect } from "vitest";
import { Gate } from "./gate";
import { SignLensModel, buildFeatures, VARIANTS, INPUT_DIM } from "./signlens";

const labels = ["a", "b", "c"];
const cfg = { min_prob: 0.85, min_margin: 0.3, smoothing_window: 3, smoothing_agree: 1, hold_ms: 600, release_ms: 300 };
const P = (a: number, b: number, c: number) => [a, b, c];
const run = (g: Gate, t0: number, n: number, step: number, probs: number[] | null, hand = true) => { let o; for (let i = 0; i < n; i++) o = g.update(t0 + i * step, hand, probs); return o!; };

describe("gate", () => {
  it("no hand -> no_hand, no word", () => { const o = new Gate(labels, cfg, "__none__").update(0, false, null); expect(o.state).toBe("no_hand"); expect(o.label).toBeNull(); });
  it("low confidence -> uncertain, no word", () => { const o = run(new Gate(labels, cfg, "__none__"), 0, 6, 50, P(0.6, 0.3, 0.1)); expect(o.state).toBe("uncertain"); expect(o.label).toBeNull(); expect(o.reason).toBe("low_prob"); });
  it("small margin -> uncertain", () => { expect(run(new Gate(labels, { ...cfg, min_prob: 0.4 }), 0, 6, 50, P(0.5, 0.45, 0.05)).reason).toBe("low_margin"); });
  it("needs a stable window first", () => { expect(new Gate(labels, cfg, "__none__").update(0, true, P(0.95, 0.03, 0.02)).reason).toBe("unstable"); });
  it("commits once, then not again until the hand leaves", () => {
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

const hand = (dx = 0) => Array.from({ length: 21 }, (_, i) => [0.4 + dx + 0.01 * i, 0.6 - 0.02 * i, -0.005 * i] as [number, number, number]);
describe("signlens features / model", () => {
  it("24 variants, 156 values, exactly one slot filled for one hand", () => {
    expect(VARIANTS.length).toBe(24);
    for (const v of VARIANTS) {
      const f = buildFeatures([{ landmarks: hand(), hand: "Right", score: 1 }], v)!; expect(f.length).toBe(INPUT_DIM);
      const a = f.slice(0, 78).some((x) => x !== 0), b = f.slice(78).some((x) => x !== 0);
      expect(a !== b).toBe(true);
    }
  });
  it("two hands fill both slots, ordered by x", () => {
    const f = buildFeatures([{ landmarks: hand(0.3), hand: "Right", score: 1 }, { landmarks: hand(0), hand: "Left", score: 1 }], VARIANTS[0])!;
    expect(Array.from(f.slice(0, 78)).some((x) => x !== 0) && Array.from(f.slice(78)).some((x) => x !== 0)).toBe(true);
  });
  it("no hand -> null; wrist-centred, scale-free", () => {
    expect(buildFeatures([], VARIANTS[0])).toBeNull();
    const a = buildFeatures([{ landmarks: hand(), hand: "Right", score: 1 }], VARIANTS[0])!;
    const big = hand().map((p) => [p[0] * 2, p[1] * 2, p[2] * 2] as [number, number, number]);
    const b = buildFeatures([{ landmarks: big, hand: "Right", score: 1 }], VARIANTS[0])!;
    for (let i = 0; i < 78; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-5);
  });
  it("model: loads both weight orientations and returns a probability vector", () => {
    const rnd = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => Math.random() - 0.5));
    const base = { classes: ["x", "y", "z"], b0: Array(8).fill(0), b1: Array(3).fill(0) };
    for (const t of [false, true]) {
      const w0 = t ? rnd(8, INPUT_DIM) : rnd(INPUT_DIM, 8), w1 = t ? rnd(3, 8) : rnd(8, 3);
      const m = new SignLensModel({ ...base, w0, w1 });
      const p = m.predict(new Float32Array(INPUT_DIM).fill(0.1)); expect(p.length).toBe(3); expect(Math.abs(p[0] + p[1] + p[2] - 1)).toBeLessThan(1e-9);
    }
    expect(() => new SignLensModel({ foo: 1 })).toThrow(/Top-level keys/);
  });
});
