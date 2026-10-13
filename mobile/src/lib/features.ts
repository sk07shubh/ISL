/**
 * Port of training/features.py (build_features with two_hand=True, rotate=False, extras=True).
 * Must give the same 161 numbers as Python. tests/phone.test.ts checks this against tests/golden.json.
 */
export type Point = [number, number, number];
export type Hand = Point[];          // 21 points

const WRIST = 0, MIDDLE_MCP = 9;
const TIPS = [4, 8, 12, 16, 20];
const PAIRS: [number, number][] = [];
for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) PAIRS.push([i, j]);   // same order as numpy triu_indices

export const FEATURE_DIM = 161;

/** Left-to-right order by mean x, as sort_hands() in features.py (raw x, before aspect correction). */
export function sortHands(hands: Hand[]): Hand[] {
  const mean = (h: Hand) => h.reduce((s, p) => s + p[0], 0) / h.length;
  return [...hands].sort((a, b) => mean(a) - mean(b));
}

function sub(a: Point, b: Point): Point { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function norm(a: Point): number { return Math.hypot(a[0], a[1], a[2]); }

/** Shape measurements from a cleaned hand: 5 fingertip-to-wrist distances, then 10 fingertip-to-fingertip distances. */
function extraFeatures(c: Point[]): number[] {
  const out: number[] = [];
  for (const t of TIPS) out.push(norm(sub(c[t], c[WRIST])));
  for (const [i, j] of PAIRS) out.push(norm(sub(c[TIPS[i]], c[TIPS[j]])));
  return out;
}

/** Move the wrist to 0, then divide by the wrist-to-middle-knuckle distance in the image plane. */
function cleanHand(h: Hand): { c: Point[]; scale: number } | null {
  const w = h[WRIST];
  const p: Point[] = h.map((q) => sub(q, w));
  const v0 = p[MIDDLE_MCP][0], v1 = p[MIDDLE_MCP][1];
  const scale = Math.hypot(v0, v1);
  if (scale < 1e-6) return null;
  return { c: p.map((q) => [q[0] / scale, q[1] / scale, q[2] / scale]), scale };
}

/** 161 numbers, or null if no hand is usable. `hands` must already be in sortHands() order. */
export function buildFeatures(hands: Hand[], aspect: number): Float64Array | null {
  const cleaned: { c: Point[]; scale: number; h: Hand }[] = [];
  for (const raw of hands) {
    const h: Hand = raw.map((p) => [p[0] * aspect, p[1], p[2]] as Point);
    const r = cleanHand(h);
    if (r) cleaned.push({ ...r, h });
  }
  if (cleaned.length === 0) return null;

  const width = 63 + 15;
  const slots = new Float64Array(2 * width);
  const present = [0, 0];
  for (let i = 0; i < Math.min(2, cleaned.length); i++) {
    const { c } = cleaned[i];
    const flat: number[] = [];
    for (const p of c) flat.push(p[0], p[1], p[2]);
    flat.push(...extraFeatures(c));
    slots.set(flat, i * width);
    present[i] = 1;
  }
  const rel: Point = [0, 0, 0];
  if (cleaned.length >= 2) {
    const h0 = cleaned[0].h[WRIST], h1 = cleaned[1].h[WRIST], s0 = cleaned[0].scale;
    for (let k = 0; k < 3; k++) rel[k] = (h1[k] - h0[k]) / s0;
  }
  const out = new Float64Array(FEATURE_DIM);
  out.set(slots, 0);
  out[2 * width] = present[0];
  out[2 * width + 1] = present[1];
  out.set(rel, 2 * width + 2);
  return out;
}
