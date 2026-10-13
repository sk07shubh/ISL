"""Writes mobile/tests/analytics_golden.json: Python analytics results the phone port must reproduce.
Run from the repo root:  python3 scripts/make_analytics_golden.py"""
import json, pathlib, sys, random
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app import analytics as A

rnd = random.Random(11)
labels = ["A", "B", "C", "D"]
rows = []
for i in range(60):
    target = rnd.choice(labels)
    conf = round(rnd.uniform(0.5, 0.99), 4)
    top = target if rnd.random() < 0.8 else rnd.choice(labels)
    rows.append({
        "test_id": 1 + i // 20, "tester": "T01", "lighting": rnd.choice(["bright", "dim", None]),
        "distance": rnd.choice(["near", "far", None]), "target": target,
        "predicted": top if conf >= 0.8 else None, "confidence": conf if conf >= 0.8 else None,
        "top_label": top, "top_conf": conf,
        "elapsed_ms": rnd.randint(600, 7000), "hand_size": round(rnd.uniform(0.05, 0.3), 4),
        "brightness": round(rnd.uniform(30, 220), 1),
    })
out = {
    "labels": labels, "threshold": 0.8, "rows": rows,
    "overall": A.summary(rows, 0.8),
    "per_sign": A.per_sign(rows, 0.8, labels),
    "risk_coverage": A.risk_coverage(rows),
    "recommended_threshold": A.recommend_threshold(A.risk_coverage(rows), len(rows)),
    "calibration": A.calibration(rows),
    "by_lighting": A.by_group(rows, 0.8, lambda r: r.get("lighting")),
    "by_distance": A.by_group(rows, 0.8, lambda r: r.get("distance")),
    "confusion": A.confusion(rows, 0.8, labels),
}
(ROOT / "mobile/tests/analytics_golden.json").write_text(json.dumps(out))
print("wrote analytics golden:", len(rows), "rows; recommended", out["recommended_threshold"])
