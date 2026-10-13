import { HEADS, type HeadName } from "./onDevice";
import type { ModelInfo, VocabEntry } from "./types";
import { GATE } from "./config";

const KIND: Record<HeadName, VocabEntry["kind"]> = { alphabet: "letter", digit: "digit", phrase: "word" };
const GROUP: Record<HeadName, VocabEntry["group"]> = { alphabet: "Letters", digit: "Digits", phrase: "Phrases" };

/** Every sign, in the same order the backend uses: letters, digits, phrases. */
export const SIGNS: VocabEntry[] = (["alphabet", "digit", "phrase"] as HeadName[]).flatMap((h) =>
  HEADS[h].labels.map((key) => ({
    key, kind: KIND[h], group: GROUP[h], name: key, names: { en: key }, short: key, category: GROUP[h],
    speak: h === "phrase" ? key : null, description: "", image: "", verified: false, active: true, note: "",
  })));

export const LABELS = SIGNS.map((s) => s.key);

/** The model description the screens show (same shape as the backend's /api/model). */
export function localModelInfo(parityOk: boolean): ModelInfo {
  const heads = Object.fromEntries((Object.keys(HEADS) as HeadName[]).map((n) => [n, {
    name: `on-device ${n} model`, labels: HEADS[n].labels, threshold: HEADS[n].threshold, features: 161,
    aspect: HEADS[n].fixedAspect, kind: KIND[n],
  }])) as ModelInfo["heads"];
  return {
    heads, labels: LABELS,
    gate: { threshold: Math.min(...Object.values(HEADS).map((h) => h.threshold)), smooth: GATE.smooth, stable: GATE.stable, hold_ms: GATE.hold_ms, release_ms: GATE.release_ms },
    parity: { ok: parityOk, heads: {} },
    source: "on-device (bundled model.json files)",
  };
}
