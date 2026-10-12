import { getJson } from "./api";
import { AppError, type ConfigFile, type Vocabulary } from "./types";
import { INPUT_DIM, SignLensModel } from "./signlens";
import { Gate } from "./gate";

export interface ModelRuntime { model: SignLensModel; labels: string[]; cfg: ConfigFile; makeGate: () => Gate }
let vocabP: Promise<Vocabulary> | null = null, modelP: Promise<ModelRuntime> | null = null;
export const resetRuntime = () => { vocabP = null; modelP = null; };
export const loadVocab = () => (vocabP ??= getJson<Vocabulary>("/api/vocabulary", "/api/vocabulary"));

export function loadModelRuntime(): Promise<ModelRuntime> {
  return (modelP ??= (async () => {
    const cfg = await getJson<ConfigFile>("/model/config.json", "model/config.json");
    const [labels, weights] = await Promise.all([
      getJson<string[]>("/model/labels.json", "model/labels.json"),
      getJson<Record<string, any>>("/model/" + cfg.weights_file, "model/" + cfg.weights_file),
    ]);
    if (cfg.input_dim !== INPUT_DIM) throw new AppError("version_mismatch", "model/config.json", `config.json says ${cfg.input_dim} inputs; this app builds ${INPUT_DIM}.`);
    const model = new SignLensModel(weights, "model/" + cfg.weights_file);
    if (JSON.stringify(model.classes) !== JSON.stringify(labels))
      throw new AppError("version_mismatch", "model/labels.json", `labels.json (${labels.length}) does not match the classes inside ${cfg.weights_file} (${model.classes.length}). Class order must be identical.`);
    return { model, labels, cfg, makeGate: () => new Gate(labels, cfg, "__none__") };
  })().catch((e) => { modelP = null; throw e; }));
}
