export type Landmark = [number, number, number];
export type Handedness = "Left" | "Right";
export interface TrackHand { landmarks: Landmark[]; hand: Handedness; score: number }
export interface TrackResult { hands: TrackHand[] }

export interface VocabEntry {
  kind: "letter" | "digit" | "word"; speak?: string | null; group: "Letters" | "Digits" | "Phrases";
  key: string; name: string; names: { en: string; hi?: string; mr?: string }; short: string; category: string;
  description: string; image: string; verified: boolean; active: boolean; note: string;
}
export interface Vocabulary { signs: VocabEntry[] }

export interface GateConfig {
  min_prob: number; min_margin: number; smoothing_window: number; smoothing_agree: number; hold_ms: number; release_ms: number;
}
export type GateState = "no_hand" | "uncertain" | "recognised";
export type UncertainReason = "low_prob" | "low_margin" | "other_class" | "unstable" | "rejected";
export interface GateOutput {
  state: GateState; reason?: UncertainReason;
  label: string | null;          // only set when state === "recognised"
  confidence: number; margin: number;
  top: { label: string; prob: number }[];
  holdProgress: number; holdMs: number;
  committed: string | null;      // set on the single frame a sign is committed
  locked: boolean;
}

export interface ModelHead { name: string; labels: string[]; threshold: number; features: number; aspect: number | null; kind: "letter" | "digit" | "word" }
export interface ModelInfo {
  heads: Record<"alphabet" | "digit" | "phrase", ModelHead>;
  labels: string[];
  gate: { threshold: number; smooth: number; stable: number; hold_ms: number; release_ms: number };
  parity: { ok: boolean; heads: Record<string, { ok: boolean; max_feature_diff: number; max_prob_diff: number; fixture: string }> };
  source: string;
}

export class AppError extends Error {
  kind: "missing_file" | "version_mismatch" | "bad_file" | "tracker";
  file: string;
  constructor(kind: AppError["kind"], file: string, message: string) { super(message); this.kind = kind; this.file = file; }
}
