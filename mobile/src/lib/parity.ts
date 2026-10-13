import { buildFeatures, sortHands, type Hand } from "./features";
import { forward } from "./model";
import { HEADS } from "./onDevice";
import golden from "../../assets/golden.json";

/** Runs on the phone at startup: the reference case from Python must come out the same. If not, the app warns. */
export function parityCheck(): { ok: boolean; maxDiff: number } {
  const c = (golden as any).cases[0];
  let maxDiff = 0;
  for (const name of ["alphabet", "digit", "phrase"] as const) {
    const head = HEADS[name];
    const x = buildFeatures(sortHands(c.hands as Hand[]), head.fixedAspect ?? c.aspect);
    const ref = c.heads[name];
    if (!x || !ref.probs) return { ok: false, maxDiff: Infinity };
    const p = forward(head.layers, x);
    for (let i = 0; i < p.length; i++) maxDiff = Math.max(maxDiff, Math.abs(p[i] - ref.probs[i]));
  }
  return { ok: maxDiff < 1e-4, maxDiff };
}
