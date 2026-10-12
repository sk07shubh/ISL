/**
 * SignLens ISL model (venmugilrajan/SignLens-Landmark-Model, Apache-2.0): MLP 512-256-128, 35 classes, 156-D input.
 * Input = two 78-D hand slots; 78 = 21 landmarks x 3 (wrist-centred, scaled by wrist->middle-knuckle) + 15 finger-joint angles.
 *
 * !! The model card does NOT publish the exact feature layout. The details below (order of coords/angles, angle unit,
 * how the two slots are ordered, mirroring) are a reconstruction, expressed as VARIANTS. Variant 0 is the best guess;
 * the in-app "Calibrate" step tries every variant against a sign you show and keeps the one the model agrees with.
 */
import { AppError, type Handedness, type Landmark, type TrackHand } from "./types";

export const INPUT_DIM = 156;
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];

export interface Variant { id: number; layout: "coords-angles" | "angles-coords"; angle: "rad" | "norm"; order: "x-first" | "x-last" | "hand"; flipX: boolean }
export const VARIANTS: Variant[] = [];
for (const flipX of [false, true]) for (const order of ["x-first", "hand", "x-last"] as const)
  for (const layout of ["coords-angles", "angles-coords"] as const) for (const angle of ["rad", "norm"] as const)
    VARIANTS.push({ id: VARIANTS.length, layout, angle, order, flipX });

export const describeVariant = (v: Variant) =>
  `${v.layout === "coords-angles" ? "coords then angles" : "angles then coords"} · ${v.angle === "rad" ? "radians" : "angle/π"} · ${v.order === "hand" ? "slots by Left/Right label" : v.order === "x-first" ? "slots by x position" : "single hand in slot 2"} · ${v.flipX ? "x mirrored" : "x as tracked"}`;

function handVec(lm: Landmark[], v: Variant): Float32Array | null {
  const P = lm.map((p) => [p[0], p[1], p[2]]);
  const w = P[0].slice();
  for (const p of P) { p[0] -= w[0]; p[1] -= w[1]; p[2] -= w[2]; }
  const scale = Math.hypot(P[9][0], P[9][1], P[9][2]);
  if (!(scale > 1e-6)) return null;
  for (const p of P) { p[0] /= scale; p[1] /= scale; p[2] /= scale; if (v.flipX) p[0] = -p[0]; }
  const out = new Float32Array(78);
  const coords: number[] = []; for (const p of P) coords.push(p[0], p[1], p[2]);
  const angles: number[] = [];
  for (const ch of CHAINS) for (let j = 1; j <= 3; j++) {
    const a = P[ch[j - 1]].map((x, i) => x - P[ch[j]][i]), b = P[ch[j + 1]].map((x, i) => x - P[ch[j]][i]);
    const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]) + 1e-12);
    const ang = Math.acos(Math.max(-1, Math.min(1, c)));
    angles.push(v.angle === "rad" ? ang : ang / Math.PI);
  }
  const all = v.layout === "coords-angles" ? coords.concat(angles) : angles.concat(coords);
  out.set(all); return out;
}

/** hands (0-2) -> 156 numbers, or null when there is no usable hand. */
export function buildFeatures(hands: TrackHand[], v: Variant): Float32Array | null {
  if (!hands.length) return null;
  const vecs = hands.slice(0, 2).map((h) => ({ h: h.hand, x: h.landmarks[0][0], vec: handVec(h.landmarks, v) }));
  if (vecs.some((x) => !x.vec)) return null;
  const out = new Float32Array(INPUT_DIM);
  let slots: (Float32Array | null)[] = [null, null];
  if (v.order === "hand") {
    for (const e of vecs) slots[e.h === "Left" ? 0 : 1] = slots[e.h === "Left" ? 0 : 1] ? slots[e.h === "Left" ? 0 : 1] : e.vec;
    if (vecs.length === 2 && !(slots[0] && slots[1])) { const s = [...vecs].sort((a, b) => a.x - b.x); slots = [s[0].vec, s[1].vec]; }
  } else {
    const s = [...vecs].sort((a, b) => a.x - b.x);
    slots = s.length === 2 ? [s[0].vec, s[1].vec] : v.order === "x-first" ? [s[0].vec, null] : [null, s[0].vec];
  }
  if (slots[0]) out.set(slots[0], 0);
  if (slots[1]) out.set(slots[1], 78);
  return out;
}

export class SignLensModel {
  readonly classes: string[];
  readonly keys: string[];
  private layers: { W: Float32Array; b: Float32Array; nIn: number; nOut: number }[] = [];
  private mean: Float32Array | null = null; private scale: Float32Array | null = null;

  constructor(j: Record<string, any>, file = "model/isl_landmarks_weights.json") {
    this.keys = Object.keys(j);
    const ws = this.keys.filter((k) => /^w\d+$/i.test(k)).sort((a, b) => +a.slice(1) - +b.slice(1));
    if (!ws.length || !Array.isArray(j.classes))
      throw new AppError("bad_file", file, `Unexpected weights format. Top-level keys found: ${this.keys.slice(0, 12).join(", ")}. Expected "classes" and "w0, b0, w1, b1, …".`);
    this.classes = j.classes.map(String);
    let dim = INPUT_DIM;
    for (const wk of ws) {
      const bk = "b" + wk.slice(1), W: number[][] = j[wk], b: number[] = j[bk];
      if (!Array.isArray(b)) throw new AppError("bad_file", file, `Missing bias array "${bk}" for "${wk}".`);
      let nIn: number, nOut: number, flat: Float32Array;
      if (W.length === dim && W[0].length === b.length) { nIn = dim; nOut = b.length; flat = new Float32Array(nIn * nOut); for (let i = 0; i < nIn; i++) for (let o = 0; o < nOut; o++) flat[o * nIn + i] = W[i][o]; }
      else if (W.length === b.length && W[0].length === dim) { nIn = dim; nOut = b.length; flat = new Float32Array(nIn * nOut); for (let o = 0; o < nOut; o++) for (let i = 0; i < nIn; i++) flat[o * nIn + i] = W[o][i]; }
      else throw new AppError("bad_file", file, `Layer ${wk} has shape ${W.length}x${W[0]?.length} which does not chain from ${dim} inputs.`);
      this.layers.push({ W: flat, b: Float32Array.from(b), nIn, nOut }); dim = nOut;
    }
    if (dim !== this.classes.length) throw new AppError("bad_file", file, `Output size ${dim} does not match ${this.classes.length} classes.`);
    const m = j.mean ?? j.scaler_mean, s = j.scale ?? j.std ?? j.scaler_scale;
    if (Array.isArray(m) && Array.isArray(s) && m.length === INPUT_DIM) { this.mean = Float32Array.from(m); this.scale = Float32Array.from(s); }
  }
  get hasScaler() { return !!this.mean; }
  get nClasses() { return this.classes.length; }

  predict(x: ArrayLike<number>): Float64Array {
    let a = Float64Array.from(x as ArrayLike<number>);
    if (this.mean && this.scale) for (let i = 0; i < a.length; i++) a[i] = (a[i] - this.mean[i]) / (this.scale[i] || 1);
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li], out = new Float64Array(L.nOut), last = li === this.layers.length - 1;
      for (let o = 0; o < L.nOut; o++) { let s = L.b[o]; const base = o * L.nIn; for (let i = 0; i < L.nIn; i++) s += L.W[base + i] * a[i]; out[o] = last ? s : Math.max(0, s); }
      a = out;
    }
    let mx = -Infinity; for (const v of a) if (v > mx) mx = v;
    let sum = 0; for (let i = 0; i < a.length; i++) { a[i] = Math.exp(a[i] - mx); sum += a[i]; }
    for (let i = 0; i < a.length; i++) a[i] /= sum;
    return a;
  }
}
export type { Handedness };
