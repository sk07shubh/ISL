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

export interface LiveData {
  tests: { id: number; tester: string; created_at: string; attempts: number; correct: number; lighting: string | null; distance: string | null }[];
  attempts: { tester: string; target: string; predicted: string | null; confidence: number | null; margin: number | null }[];
}
