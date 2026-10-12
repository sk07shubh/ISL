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

export interface Attempt { target: string; predicted: string | null; confidence: number | null; margin: number | null }
export interface LiveData {
  tests: { id: number; tester: string; created_at: string; attempts: number; correct: number }[];
  attempts: (Attempt & { tester: string })[];
}
export const liveTests = () => getJson<LiveData>("/api/live-tests", "/api/live-tests");
export async function saveTest(tester: string, attempts: Attempt[]) {
  const r = await fetch("/api/live-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tester, attempts }) });
  if (!r.ok) throw new Error(`Could not save (${r.status})`);
}
export async function deleteTester(tester: string) { await fetch(`/api/live-tests/${encodeURIComponent(tester)}`, { method: "DELETE" }); }
