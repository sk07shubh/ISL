import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFeatures, sortHands } from "../src/lib/features";
import { forward } from "../src/lib/model";
import { HEADS } from "../src/lib/onDevice";

const golden = JSON.parse(readFileSync(resolve(process.cwd(), "tests/golden.json"), "utf-8"));

describe("phone pipeline matches the Python pipeline", () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const hands = sortHands(c.hands);
      for (const name of ["alphabet", "digit", "phrase"] as const) {
        const ref = c.heads[name];
        const head = HEADS[name];
        const x = buildFeatures(hands, head.fixedAspect ?? c.aspect);
        if (ref.features === null) { expect(x).toBeNull(); continue; }
        expect(x).not.toBeNull();
        expect(x!.length).toBe(161);
        for (let i = 0; i < 161; i++) expect(Math.abs(x![i] - ref.features[i])).toBeLessThan(1e-4);
        const p = forward(head.layers, x!);
        for (let i = 0; i < p.length; i++) expect(Math.abs(p[i] - ref.probs[i])).toBeLessThan(1e-4);
      }
    });
  }
});
