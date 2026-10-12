import { AppError } from "./types";

export async function getJson<T>(url: string, file = url): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { cache: "no-store" }); }
  catch { throw new AppError("missing_file", file, `Cannot reach the backend while loading ${file}. Is "python scripts/run.py" running?`); }
  if (!r.ok) throw new AppError("missing_file", file, r.status === 404 && file.startsWith("model/isl_") ? `Missing file: ${file}. Run  python scripts/fetch_assets.py  once (needs internet), then check again.` : `Missing file: ${file} (HTTP ${r.status})`);
  try { return (await r.json()) as T; } catch { throw new AppError("bad_file", file, `${file} is not valid JSON`); }
}
export const health = async () => { try { return (await fetch("/health")).ok; } catch { return false; } };

export interface Attempt { target: string; predicted: string | null; confidence: number | null; margin: number | null }
export interface LiveData { tests: { id: number; tester: string; created_at: string; attempts: number; correct: number }[]; attempts: (Attempt & { tester: string })[] }
export const liveTests = () => getJson<LiveData>("/api/live-tests", "/api/live-tests");
export async function saveTest(tester: string, attempts: Attempt[]) {
  const r = await fetch("/api/live-tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tester, attempts }) });
  if (!r.ok) throw new Error(`Could not save (${r.status})`);
}
export async function deleteTester(tester: string) { await fetch(`/api/live-tests/${encodeURIComponent(tester)}`, { method: "DELETE" }); }
