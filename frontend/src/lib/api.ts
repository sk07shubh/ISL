import { AppError, type Landmark } from "./types";

export type Mode = "alphabet" | "digit";

export async function getJson<T>(url: string, file = url): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { cache: "no-store" }); }
  catch { throw new AppError("missing_file", file, `Cannot reach the backend (${file}). Is "python3 scripts/run.py" running?`); }
  if (!r.ok) {
    const detail = await r.json().then((j) => j.detail).catch(() => null);
    throw new AppError("missing_file", file, typeof detail === "string" ? detail : `${file} returned HTTP ${r.status}`);
  }
  try { return (await r.json()) as T; } catch { throw new AppError("bad_file", file, `${file} is not valid JSON`); }
}

export const health = async () => { try { return (await fetch("/health")).ok; } catch { return false; } };

/** One frame of hand points to the trained classifier running in the backend. */
export async function predictFrame(hands: Landmark[][], aspect: number, mode: Mode): Promise<{ probs: number[] | null; labels: string[] }> {
  const r = await fetch("/api/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hands, aspect, mode }) });
  if (!r.ok) throw new Error(`predict failed (${r.status})`);
  return r.json();
}

export interface Attempt {
  target: string; predicted: string | null; confidence: number | null; margin: number | null;
  top_label?: string | null; top_conf?: number | null; elapsed_ms?: number | null; hand_size?: number | null; brightness?: number | null;
}
export interface TestMeta { tester: string; lighting?: "bright" | "dim" | "mixed" | null; distance?: "near" | "medium" | "far" | null; note?: string | null }

export interface Summary {
  attempts: number; shown: number; correct: number; wrong_shown: number; uncertain: number;
  accuracy_all: number | null; coverage: number | null; precision_shown: number | null; wrong_shown_rate: number | null; median_time_ms: number | null;
}
export interface Analytics {
  filters: { lighting: string | null; distance: string | null };
  threshold: number; tests: number; testers: number; overall: Summary;
  risk_coverage: { threshold: number; coverage: number | null; precision_shown: number | null; wrong_shown_rate: number | null; accuracy_all: number | null }[];
  recommended_threshold: number | null; wrong_shown_target: number;
  calibration: { bins: { lo: number; hi: number; n: number; mean_confidence: number | null; accuracy: number | null }[]; ece: number | null; n: number };
  per_sign: { key: string; support: number; predicted: number; tp: number; precision: number | null; recall: number | null; f1: number | null; uncertain: number; median_time_ms: number | null }[];
  confusion: { labels: string[]; matrix: number[][]; uncertain: number[] };
  by_condition: Record<string, Record<string, Summary>>;
  model: string; parity_ok: boolean;
}
export async function getAnalytics(f: { lighting?: string; distance?: string }): Promise<Analytics> {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return getJson<Analytics>("/api/analytics" + (q ? "?" + q : ""), "/api/analytics");
}
export interface LiveData {
  tests: { id: number; tester: string; created_at: string; attempts: number; correct: number; lighting: string | null; distance: string | null }[];
  attempts: (Attempt & { tester: string })[];
}
export const liveTests = () => getJson<LiveData>("/api/live-tests", "/api/live-tests");
export async function saveTest(meta: TestMeta, attempts: Attempt[]) {
  const r = await fetch("/api/live-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...meta, attempts }) });
  if (!r.ok) throw new Error(`Could not save (${r.status})`);
}
export async function deleteTester(tester: string) { await fetch(`/api/live-tests/${encodeURIComponent(tester)}`, { method: "DELETE" }); }
