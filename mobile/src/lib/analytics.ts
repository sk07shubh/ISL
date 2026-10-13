/** Port of backend/app/analytics.py: the same definitions, run on the phone. Checked by tests/analytics.test.ts. */
export interface Row {
  target: string; predicted: string | null; confidence: number | null;
  top_label?: string | null; top_conf?: number | null; elapsed_ms?: number | null;
  hand_size?: number | null; brightness?: number | null; lighting?: string | null; distance?: string | null;
  test_id?: number; tester?: string;
}
export interface Summary {
  attempts: number; shown: number; correct: number; wrong_shown: number; uncertain: number;
  accuracy_all: number | null; coverage: number | null; precision_shown: number | null; wrong_shown_rate: number | null; median_time_ms: number | null;
}
export interface SignStat { key: string; support: number; predicted: number; tp: number; precision: number | null; recall: number | null; f1: number | null; uncertain: number; median_time_ms: number | null }
export interface CurvePoint { threshold: number; coverage: number | null; precision_shown: number | null; wrong_shown_rate: number | null; accuracy_all: number | null }

export const WRONG_SHOWN_TARGET = 0.02;
export const MIN_ATTEMPTS_FOR_RECOMMENDATION = 20;
const CALIBRATION_EDGES = [0.0, 0.6, 0.8, 0.9, 0.95, 1.01];
export const THRESHOLDS = Array.from({ length: 25 }, (_, i) => Math.round((0.5 + 0.02 * i) * 100) / 100);

const div = (a: number, b: number): number | null => (b ? a / b : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function top(r: Row): [string | null, number | null] {
  const label = r.top_label != null ? r.top_label : r.predicted;
  const conf = r.top_conf != null ? r.top_conf : r.confidence;
  return [label ?? null, conf ?? null];
}

/** What the app would have shown at threshold `thr`. */
export function shownLabel(r: Row, thr: number): string | null {
  const [label, conf] = top(r);
  if (label == null || conf == null) return null;
  return conf >= thr ? label : null;
}

export function summary(rows: Row[], thr: number): Summary {
  const n = rows.length;
  const shown = rows.map((r) => ({ r, s: shownLabel(r, thr) })).filter((x) => x.s !== null) as { r: Row; s: string }[];
  const correct = shown.filter((x) => x.s === x.r.target).length;
  const times = shown.filter((x) => x.s === x.r.target && x.r.elapsed_ms != null).map((x) => x.r.elapsed_ms as number);
  return {
    attempts: n, shown: shown.length, correct, wrong_shown: shown.length - correct, uncertain: n - shown.length,
    accuracy_all: div(correct, n), coverage: div(shown.length, n), precision_shown: div(correct, shown.length),
    wrong_shown_rate: div(shown.length - correct, n), median_time_ms: median(times),
  };
}

export function perSign(rows: Row[], thr: number, labels: string[]): SignStat[] {
  return labels.map((k) => {
    const asked = rows.filter((r) => r.target === k);
    const read = rows.filter((r) => shownLabel(r, thr) === k);
    const tp = read.filter((r) => r.target === k).length;
    const prec = div(tp, read.length), rec = div(tp, asked.length);
    const f1 = prec !== null && rec !== null && prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : null;
    const times = asked.filter((r) => shownLabel(r, thr) === k && r.elapsed_ms != null).map((r) => r.elapsed_ms as number);
    return { key: k, support: asked.length, predicted: read.length, tp, precision: prec, recall: rec, f1,
      uncertain: asked.filter((r) => shownLabel(r, thr) === null).length, median_time_ms: median(times) };
  });
}

export function confusion(rows: Row[], thr: number, labels: string[]) {
  const idx = new Map(labels.map((k, i) => [k, i]));
  const m = labels.map(() => labels.map(() => 0));
  const unc = labels.map(() => 0);
  for (const r of rows) {
    const i = idx.get(r.target); if (i === undefined) continue;
    const s = shownLabel(r, thr);
    if (s === null) unc[i]++;
    else { const j = idx.get(s); if (j !== undefined) m[i][j]++; }
  }
  return { labels, matrix: m, uncertain: unc };
}

export function riskCoverage(rows: Row[]): CurvePoint[] {
  return THRESHOLDS.map((t) => {
    const s = summary(rows, t);
    return { threshold: t, coverage: s.coverage, precision_shown: s.precision_shown, wrong_shown_rate: s.wrong_shown_rate, accuracy_all: s.accuracy_all };
  });
}

/** Lowest-coverage-cost threshold whose wrong-shown rate stays under the target. */
export function recommendThreshold(curve: CurvePoint[], n: number): number | null {
  if (n < MIN_ATTEMPTS_FOR_RECOMMENDATION) return null;
  const ok = curve.filter((c) => c.wrong_shown_rate !== null && c.wrong_shown_rate <= WRONG_SHOWN_TARGET && c.coverage);
  if (!ok.length) return null;
  return ok.reduce((best, c) => (c.coverage! > best.coverage! || (c.coverage === best.coverage && c.threshold > best.threshold) ? c : best)).threshold;
}

export function calibration(rows: Row[]) {
  const pairs = rows.map((r) => { const [l, c] = top(r); return l != null && c != null ? { c, ok: l === r.target } : null; }).filter((x): x is { c: number; ok: boolean } => x !== null);
  const bins = CALIBRATION_EDGES.slice(0, -1).map((lo, i) => {
    const hi = CALIBRATION_EDGES[i + 1];
    const band = pairs.filter((p) => p.c >= lo && p.c < hi);
    return { lo, hi: Math.min(hi, 1), n: band.length,
      mean_confidence: div(band.reduce((s, p) => s + p.c, 0), band.length),
      accuracy: div(band.filter((p) => p.ok).length, band.length) };
  });
  const total = pairs.length;
  const ece = total ? bins.filter((b) => b.n).reduce((s, b) => s + (b.n / total) * Math.abs((b.accuracy as number) - (b.mean_confidence as number)), 0) : null;
  return { bins, ece, n: total };
}

export function byGroup(rows: Row[], thr: number, key: (r: Row) => string | null | undefined): Record<string, Summary> {
  const groups: Record<string, Row[]> = {};
  for (const r of rows) { const k = key(r); if (k == null) continue; (groups[String(k)] ??= []).push(r); }
  return Object.fromEntries(Object.keys(groups).sort().map((k) => [k, summary(groups[k], thr)]));
}
