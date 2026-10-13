import { getJson } from "./api";
import type { GateConfig, ModelInfo, Vocabulary } from "./types";

let infoP: Promise<ModelInfo> | null = null;
let vocabP: Promise<Vocabulary> | null = null;
export const resetRuntime = () => { infoP = null; vocabP = null; };

/** Model description from the backend: all three heads, their labels, thresholds, smoothing and parity. Loaded once. */
export const loadModel = (): Promise<ModelInfo> =>
  (infoP ??= getJson<ModelInfo>("/api/model", "/api/model").catch((e) => { infoP = null; throw e; }));

/** Every sign: letters, digits and phrases. */
export const loadVocab = (): Promise<Vocabulary> =>
  (vocabP ??= getJson<Vocabulary>("/api/vocabulary", "/api/vocabulary").catch((e) => { vocabP = null; throw e; }));

/** Gate rules. Each model's own threshold is applied in the engine; the gate gets the lowest one. */
export function gateConfig(info: ModelInfo): GateConfig {
  return { min_prob: info.gate.threshold, min_margin: 0, smoothing_window: info.gate.stable, smoothing_agree: 1,
           hold_ms: info.gate.hold_ms, release_ms: info.gate.release_ms };
}
