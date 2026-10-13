/** Same rules as the web app and training/live_clean.py (combined mode). */
export interface HeadSpec { labels: string[]; threshold: number }
export interface Slot { head: string; j: number }

export function buildSlots(labels: string[], heads: Record<string, HeadSpec>): Slot[] {
  return labels.map((key) => {
    for (const [head, spec] of Object.entries(heads)) { const j = spec.labels.indexOf(key); if (j >= 0) return { head, j }; }
    return { head: "", j: -1 };
  });
}

/** One value per sign: the average over the window, counted only if above that model's own threshold. Null until a window is full. */
export function combine(labels: string[], heads: Record<string, HeadSpec>, slots: Slot[],
                        histories: Record<string, Float64Array[]>, active: Set<string>, smooth: number): Float64Array | null {
  const avg: Record<string, Float64Array> = {};
  let anyFull = false;
  for (const h of Object.keys(heads)) {
    const rows = histories[h] ?? [];
    if (active.has(h) && rows.length >= smooth) {
      anyFull = true;
      const a = new Float64Array(rows[0].length);
      for (const r of rows) for (let i = 0; i < r.length; i++) a[i] += r[i] / rows.length;
      avg[h] = a;
    }
  }
  if (!anyFull) return null;
  const out = new Float64Array(labels.length);
  slots.forEach((s, i) => {
    if (!avg[s.head]) return;
    const p = avg[s.head][s.j];
    out[i] = p >= heads[s.head].threshold ? p : 0;
  });
  return out;
}
