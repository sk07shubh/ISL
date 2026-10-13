"""Live-test analytics. Pure functions over attempt rows, so they can be unit-tested without a server.

Each row is a dict: target, predicted, confidence, margin, top_label, top_conf, elapsed_ms, hand_size, brightness,
tester, lighting, distance. Rows written before the top_* fields existed fall back to predicted/confidence.

Definitions (see README "Test metrics"):
  shown      = the app displayed a sign (top prediction confidence >= threshold)
  correct    = shown and equal to the sign that was asked for
  wrong_shown= shown but wrong  <- the failure the PS asks us to avoid ("confidently wrong")
  uncertain  = the app stayed Uncertain (abstained)
  coverage   = shown / attempts
  precision_shown = correct / shown
  wrong_shown_rate = wrong_shown / attempts
"""
from typing import Dict, List, Optional

THRESHOLDS = [round(0.50 + 0.02 * i, 2) for i in range(25)]      # 0.50 .. 0.98
WRONG_SHOWN_TARGET = 0.02                                          # recommended threshold keeps wrong-shown under 2%
MIN_ATTEMPTS_FOR_RECOMMENDATION = 20
CALIBRATION_EDGES = [0.0, 0.6, 0.8, 0.9, 0.95, 1.01]


def _div(a, b):
    return None if not b else a / b


def top(r: dict):
    label = r.get("top_label") if r.get("top_label") is not None else r.get("predicted")
    conf = r.get("top_conf") if r.get("top_conf") is not None else r.get("confidence")
    return label, conf


def shown_label(r: dict, thr: float) -> Optional[str]:
    """What the app would have displayed at threshold `thr`."""
    label, conf = top(r)
    if label is None or conf is None:
        return None
    return label if conf >= thr else None


def _median(xs: List[float]):
    xs = sorted(xs)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def summary(rows: List[dict], thr: float) -> dict:
    n = len(rows)
    shown = [(r, shown_label(r, thr)) for r in rows]
    shown = [(r, s) for r, s in shown if s is not None]
    correct = sum(1 for r, s in shown if s == r["target"])
    times = [r["elapsed_ms"] for r, s in shown if s == r["target"] and r.get("elapsed_ms") is not None]
    return {
        "attempts": n, "shown": len(shown), "correct": correct, "wrong_shown": len(shown) - correct,
        "uncertain": n - len(shown),
        "accuracy_all": _div(correct, n),          # abstentions count as not correct
        "coverage": _div(len(shown), n),
        "precision_shown": _div(correct, len(shown)),
        "wrong_shown_rate": _div(len(shown) - correct, n),
        "median_time_ms": _median(times),
    }


def per_sign(rows: List[dict], thr: float, labels: List[str]) -> List[dict]:
    out = []
    for k in labels:
        asked = [r for r in rows if r["target"] == k]
        read = [r for r in rows if shown_label(r, thr) == k]
        tp = sum(1 for r in read if r["target"] == k)
        prec, rec = _div(tp, len(read)), _div(tp, len(asked))
        f1 = (2 * prec * rec / (prec + rec)) if prec is not None and rec is not None and prec + rec > 0 else None
        times = [r["elapsed_ms"] for r in asked if shown_label(r, thr) == k and r.get("elapsed_ms") is not None]
        out.append({"key": k, "support": len(asked), "predicted": len(read), "tp": tp,
                    "precision": prec, "recall": rec, "f1": f1,
                    "uncertain": sum(1 for r in asked if shown_label(r, thr) is None),
                    "median_time_ms": _median(times)})
    return out


def confusion(rows: List[dict], thr: float, labels: List[str]) -> dict:
    idx = {k: i for i, k in enumerate(labels)}
    m = [[0] * len(labels) for _ in labels]
    unc = [0] * len(labels)
    for r in rows:
        if r["target"] not in idx:
            continue
        s = shown_label(r, thr)
        if s is None:
            unc[idx[r["target"]]] += 1
        elif s in idx:
            m[idx[r["target"]]][idx[s]] += 1
    return {"labels": labels, "matrix": m, "uncertain": unc}


def risk_coverage(rows: List[dict]) -> List[dict]:
    out = []
    for t in THRESHOLDS:
        s = summary(rows, t)
        out.append({"threshold": t, "coverage": s["coverage"], "precision_shown": s["precision_shown"],
                    "wrong_shown_rate": s["wrong_shown_rate"], "accuracy_all": s["accuracy_all"]})
    return out


def recommend_threshold(curve: List[dict], n_attempts: int) -> Optional[float]:
    """Lowest threshold (most coverage) whose wrong-shown rate stays under the target."""
    if n_attempts < MIN_ATTEMPTS_FOR_RECOMMENDATION:
        return None
    ok = [c for c in curve if c["wrong_shown_rate"] is not None and c["wrong_shown_rate"] <= WRONG_SHOWN_TARGET and c["coverage"]]
    return min(ok, key=lambda c: (-c["coverage"], -c["threshold"]))["threshold"] if ok else None


def calibration(rows: List[dict]) -> dict:
    """Reliability of the top-1 prediction: within each confidence band, how often it was right."""
    bins = []
    pairs = [(top(r)[1], top(r)[0] == r["target"]) for r in rows if top(r)[1] is not None and top(r)[0] is not None]
    for lo, hi in zip(CALIBRATION_EDGES[:-1], CALIBRATION_EDGES[1:]):
        band = [(c, ok) for c, ok in pairs if lo <= c < hi]
        bins.append({"lo": lo, "hi": min(hi, 1.0), "n": len(band),
                     "mean_confidence": _div(sum(c for c, _ in band), len(band)),
                     "accuracy": _div(sum(1 for _, ok in band if ok), len(band))})
    total = len(pairs)
    ece = sum(b["n"] / total * abs(b["accuracy"] - b["mean_confidence"]) for b in bins if b["n"]) if total else None
    return {"bins": bins, "ece": ece, "n": total}


def hand_size_bin(h):
    if h is None:
        return None
    return "far (<0.10)" if h < 0.10 else "mid (0.10–0.18)" if h < 0.18 else "near (≥0.18)"


def brightness_bin(b):
    if b is None:
        return None
    return "dark (<70)" if b < 70 else "normal (70–170)" if b < 170 else "bright (>170)"


def by_group(rows: List[dict], thr: float, key) -> Dict[str, dict]:
    groups: Dict[str, List[dict]] = {}
    for r in rows:
        k = key(r)
        if k is None:
            continue
        groups.setdefault(str(k), []).append(r)
    return {k: summary(v, thr) for k, v in sorted(groups.items())}


def analytics(rows: List[dict], thr: float, labels: List[str], filters: dict) -> dict:
    curve = risk_coverage(rows)
    return {
        "filters": filters,
        "threshold": thr,
        "tests": len({r["test_id"] for r in rows}),
        "testers": len({r["tester"] for r in rows}),
        "overall": summary(rows, thr),
        "risk_coverage": curve,
        "recommended_threshold": recommend_threshold(curve, len(rows)),
        "wrong_shown_target": WRONG_SHOWN_TARGET,
        "calibration": calibration(rows),
        "per_sign": per_sign(rows, thr, labels),
        "confusion": confusion(rows, thr, labels),
        "by_condition": {
            "lighting": by_group(rows, thr, lambda r: r.get("lighting")),
            "distance": by_group(rows, thr, lambda r: r.get("distance")),
            "hand_size": by_group(rows, thr, lambda r: hand_size_bin(r.get("hand_size"))),
            "brightness": by_group(rows, thr, lambda r: brightness_bin(r.get("brightness"))),
        },
    }
