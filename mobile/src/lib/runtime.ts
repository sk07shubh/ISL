import { getModel } from "./api";
import type { ModelInfo } from "./types";

let infoP: Promise<ModelInfo> | null = null;
/** Model description from the backend, loaded once per app session. */
export const loadModel = (): Promise<ModelInfo> =>
  (infoP ??= getModel().catch((e) => { infoP = null; throw e; }));
