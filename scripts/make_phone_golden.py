"""Writes mobile/tests/golden.json: reference features and probabilities from the Python pipeline.
The phone code (TypeScript) must reproduce these numbers. Run from the repo root:  python3 scripts/make_phone_golden.py"""
import json, pathlib, sys
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app import inference as I
from backend.app import features as F

rng = np.random.default_rng(7)
heads = I.heads()
fixture = json.loads((ROOT / "model_aug/parity_test.json").read_text())
cases = []

def add(name, raw, aspect):
    hands = F.sort_hands([np.asarray(h, np.float32) for h in raw])
    entry = {"name": name, "hands": [h.tolist() for h in hands], "aspect": aspect, "heads": {}}
    feats = {}
    for hn, head in heads.items():
        x = F.build_features(hands, two_hand=True, rotate=False, aspect=head.aspect_for(aspect), extras=True)
        feats[hn] = None if x is None else x.tolist()
        probs = None if x is None else head.forward(x).tolist()
        entry["heads"][hn] = {"features": feats[hn], "probs": probs}
    cases.append(entry)

add("fixture-two-hands", fixture["raw_hands"], float(fixture["aspect"]))
for i in range(12):
    base = np.asarray(fixture["raw_hands"][0], np.float32)
    raw = [base + rng.normal(0, 0.02, base.shape).astype(np.float32) for _ in range(1 + i % 2)]
    for h in raw:
        h[:, 0] += rng.uniform(-0.3, 0.3); h[:, 1] += rng.uniform(-0.3, 0.3)
    add(f"random-{i}", [h.tolist() for h in raw], float(rng.choice([1.0, 1.3333, 0.75])))
add("degenerate", [[[0.5, 0.5, 0.0]] * 21], 1.3333)

out = ROOT / "mobile/tests/golden.json"
out.write_text(json.dumps({"cases": cases}))
print("wrote", out, len(cases), "cases")
