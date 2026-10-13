import type { ModelInfo, VocabEntry } from "./types";

export type Mode = "all" | "alphabet" | "digit" | "phrase";
export type Landmark = [number, number, number];

/** Backend address, set per build in eas.json (EXPO_PUBLIC_API_URL). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new ApiError("EXPO_PUBLIC_API_URL is not set. Add your Railway address to eas.json.");
  let r: Response;
  try { r = await fetch(API_URL + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }); }
  catch { throw new ApiError(`Cannot reach ${API_URL}. Check the internet connection.`); }
  if (!r.ok) {
    const detail = await r.json().then((j) => j.detail).catch(() => null);
    throw new ApiError(typeof detail === "string" ? detail : `Server answered HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

export const getModel = () => call<ModelInfo>("/api/model");
export const getVocab = () => call<{ signs: VocabEntry[] }>("/api/vocabulary");
export const predictFrame = (hands: Landmark[][], aspect: number) =>
  call<{ heads: Record<string, { probs: number[]; labels: string[] } | null>; reason: string | null }>("/api/predict", {
    method: "POST", body: JSON.stringify({ hands, aspect }),
  });

export interface Attempt { target: string; predicted: string | null; confidence: number | null; margin: number | null; top_label?: string | null; top_conf?: number | null; elapsed_ms?: number | null; hand_size?: number | null; brightness?: number | null }
export interface TestMeta { tester: string; lighting?: "bright" | "dim" | "mixed" | null; distance?: "near" | "medium" | "far" | null }
export const saveTest = (meta: TestMeta, attempts: Attempt[]) => call<{ id: number }>("/api/live-tests", { method: "POST", body: JSON.stringify({ ...meta, attempts }) });
export const getAnalytics = (f: { lighting?: string; distance?: string }) => {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return call<import("./analyticsTypes").Analytics>("/api/analytics" + (q ? `?${q}` : ""));
};
export const getLiveTests = () => call<import("./analyticsTypes").LiveData>("/api/live-tests");
export const deleteTester = (tester: string) => call<{ deleted_runs: number }>(`/api/live-tests/${encodeURIComponent(tester)}`, { method: "DELETE" });
export const health = async () => { try { return await call<{ status: string }>("/health"); } catch { return null; } };
