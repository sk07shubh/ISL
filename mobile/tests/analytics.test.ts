import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as A from "../src/lib/analytics";

const g = JSON.parse(readFileSync(resolve(process.cwd(), "tests/analytics_golden.json"), "utf-8"));
const close = (a: number | null, b: number | null) => { if (b === null) expect(a).toBeNull(); else expect(a).toBeCloseTo(b, 6); };

describe("analytics match the Python backend", () => {
  it("overall summary", () => {
    const s = A.summary(g.rows, g.threshold);
    for (const k of ["attempts", "shown", "correct", "wrong_shown", "uncertain"] as const) expect(s[k]).toBe(g.overall[k]);
    for (const k of ["accuracy_all", "coverage", "precision_shown", "wrong_shown_rate"] as const) close(s[k], g.overall[k]);
    close(s.median_time_ms, g.overall.median_time_ms);
  });
  it("per sign precision, recall, F1", () => {
    const ps = A.perSign(g.rows, g.threshold, g.labels);
    g.per_sign.forEach((p: any, i: number) => {
      expect(ps[i].key).toBe(p.key); expect(ps[i].support).toBe(p.support); expect(ps[i].tp).toBe(p.tp);
      close(ps[i].precision, p.precision); close(ps[i].recall, p.recall); close(ps[i].f1, p.f1);
    });
  });
  it("risk-coverage curve and recommended threshold", () => {
    const curve = A.riskCoverage(g.rows);
    g.risk_coverage.forEach((c: any, i: number) => { close(curve[i].coverage, c.coverage); close(curve[i].wrong_shown_rate, c.wrong_shown_rate); });
    expect(A.recommendThreshold(curve, g.rows.length)).toBe(g.recommended_threshold);
  });
  it("calibration gap", () => {
    close(A.calibration(g.rows).ece, g.calibration.ece);
  });
  it("breakdown by lighting and distance", () => {
    expect(Object.keys(A.byGroup(g.rows, g.threshold, (r) => r.lighting))).toEqual(Object.keys(g.by_lighting));
    const d = A.byGroup(g.rows, g.threshold, (r) => r.distance);
    for (const k of Object.keys(g.by_distance)) close(d[k].accuracy_all, g.by_distance[k].accuracy_all);
  });
  it("confusion matrix", () => {
    expect(A.confusion(g.rows, g.threshold, g.labels).matrix).toEqual(g.confusion.matrix);
  });
});
