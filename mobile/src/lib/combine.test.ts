import { describe, it, expect } from "vitest";
import { buildSlots, combine, type HeadSpec } from "./combine";

const heads: Record<string, HeadSpec> = {
  alphabet: { labels: ["A", "B"], threshold: 0.8 },
  digit: { labels: ["0", "1"], threshold: 0.8 },
  phrase: { labels: ["how are you", "stop"], threshold: 0.7 },
};
const labels = [...heads.alphabet.labels, ...heads.digit.labels, ...heads.phrase.labels];
const slots = buildSlots(labels, heads);
const all = new Set(["alphabet", "digit", "phrase"]);
const win = (v: number[], n = 8) => Array.from({ length: n }, () => Float64Array.from(v));

describe("combined decision (as live_clean.py)", () => {
  it("returns null until some model has a full window", () => {
    expect(combine(labels, heads, slots, { alphabet: win([0.9, 0.1], 3) }, all, 8)).toBeNull();
  });
  it("letters, digits and phrases can each be recognised in the same frame stream", () => {
    const h = { alphabet: win([0.1, 0.9]), digit: win([0.95, 0.05]), phrase: win([0.1, 0.9]) };
    const out = combine(labels, heads, slots, h, all, 8)!;
    const best = labels.map((l, i) => [l, out[i]] as const).sort((a, b) => b[1] - a[1]);
    expect(best[0][0]).toBe("0");                    // 0.95 digit is the most confident counted sign across the three
    expect(out[labels.indexOf("0")]).toBeGreaterThan(0.9);
    expect(out[labels.indexOf("stop")]).toBeGreaterThan(0.85);
  });
  it("a value below its own model's threshold is not counted", () => {
    const h = { alphabet: win([0.6, 0.4]), digit: win([0.5, 0.5]), phrase: win([0.1, 0.9]) };
    const out = combine(labels, heads, slots, h, all, 8)!;
    expect(out[labels.indexOf("A")]).toBe(0);        // 0.6 < 0.8
    expect(out[labels.indexOf("stop")]).toBeCloseTo(0.9);  // phrases use their own 0.7 threshold
  });
  it("a model switched off in the mode is ignored", () => {
    const h = { alphabet: win([0.1, 0.9]), digit: win([0.95, 0.05]), phrase: win([0.1, 0.9]) };
    const out = combine(labels, heads, slots, h, new Set(["digit"]), 8)!;
    expect(out[labels.indexOf("B")]).toBe(0);
    expect(out[labels.indexOf("0")]).toBeGreaterThan(0.9);
  });
  it("every sign maps to exactly one model slot", () => {
    expect(slots.every((s) => s.head !== "" && s.j >= 0)).toBe(true);
  });
});
