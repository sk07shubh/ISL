import { buildFeatures, sortHands, type Hand } from "./features";
import { forward, type ModelJson } from "./model";

import alphabetModel from "../../assets/models/alphabet/model.json";
import digitModel from "../../assets/models/digit/model.json";
import phraseModel from "../../assets/models/phrase/model.json";
import alphabetLabels from "../../assets/models/alphabet/labels.json";
import digitLabels from "../../assets/models/digit/labels.json";
import phraseLabels from "../../assets/models/phrase/labels.json";
import alphabetCfg from "../../assets/models/alphabet/config.json";
import digitCfg from "../../assets/models/digit/config.json";
import phraseCfg from "../../assets/models/phrase/config.json";

export type HeadName = "alphabet" | "digit" | "phrase";
export interface PhoneHead { name: HeadName; labels: string[]; threshold: number; fixedAspect: number | null; layers: ModelJson["layers"] }

/** The three classifiers, bundled with the app. Same settings as the backend and training/live_clean.py. */
export const HEADS: Record<HeadName, PhoneHead> = {
  alphabet: { name: "alphabet", labels: alphabetLabels as string[], threshold: alphabetCfg.threshold, fixedAspect: null, layers: (alphabetModel as ModelJson).layers },
  digit: { name: "digit", labels: digitLabels as string[], threshold: digitCfg.threshold, fixedAspect: digitCfg.aspect, layers: (digitModel as ModelJson).layers },
  phrase: { name: "phrase", labels: phraseLabels as string[], threshold: phraseCfg.threshold, fixedAspect: phraseCfg.aspect, layers: (phraseModel as ModelJson).layers },
};

/**
 * Class probabilities for each head for one frame of hand points, computed on the phone.
 * Hands are the raw MediaPipe points. The alphabet uses the camera frame's aspect; digits and phrases use
 * the aspect from their config, exactly as the backend and live_clean.py do.
 */
export function classifyAll(rawHands: Hand[], frameAspect: number): Partial<Record<HeadName, Float64Array>> {
  const hands = sortHands(rawHands);
  const out: Partial<Record<HeadName, Float64Array>> = {};
  for (const h of Object.values(HEADS)) {
    const aspect = h.fixedAspect ?? frameAspect;
    const x = buildFeatures(hands, aspect);
    if (x) out[h.name] = forward(h.layers, x);
  }
  return out;
}
