import { getJson, type Mode } from "./api";
import type { GateConfig, ModelInfo, Vocabulary } from "./types";

let infoP: Promise<ModelInfo> | null = null;
const vocabP = new Map<Mode, Promise<Vocabulary>>();
export const resetRuntime = () => { infoP = null; vocabP.clear(); };

/** Model description from the backend: labels, threshold, smoothing, parity check. Loaded once. */
export const loadModel = (): Promise<ModelInfo> =>
  (infoP ??= getJson<ModelInfo>("/api/model", "/api/model").catch((e) => { infoP = null; throw e; }));

export function loadVocab(mode: Mode): Promise<Vocabulary> {
  if (!vocabP.has(mode))
    vocabP.set(mode, getJson<Vocabulary>(`/api/vocabulary?mode=${mode}`, "/api/vocabulary").catch((e) => { vocabP.delete(mode); throw e; }));
  return vocabP.get(mode)!;
}

/** The app's sign-commit rules, fed with the same threshold and smoothing as live_clean.py. */
export function gateConfig(info: ModelInfo): GateConfig {
  return { min_prob: info.gate.threshold, min_margin: 0, smoothing_window: 1, smoothing_agree: 1, hold_ms: info.gate.hold_ms, release_ms: info.gate.release_ms };
}
