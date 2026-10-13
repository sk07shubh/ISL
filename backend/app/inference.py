"""Runs the three trained ISL classifiers (alphabet, digits, phrases) for the web app.

Same pipeline as training/live_clean.py for each model:
  * preprocessing: backend/app/features.py, a byte-identical copy of training/features.py
  * models: model.json exported from each joblib model (model_aug, model_digits_v3, model_phrases).
    The forward pass is replicated here in NumPy, so scikit-learn is not needed at runtime.
  * aspect: the alphabet model uses the camera frame's width/height; digits and phrases use the
    aspect stored in their config (1.0 and 1.3333), exactly as live_clean.py does.
parity_check() recomputes each teammate fixture and must match before the app starts answering.
"""
import json
from pathlib import Path
from typing import Optional

import numpy as np

from . import features as F

ROOT = Path(__file__).resolve().parents[2]
TASK_FILE = ROOT / "model" / "hand_landmarker.task"
SMOOTH = 8        # frames averaged per model (live_clean.py --smooth 8)
STABLE = 5        # consecutive frames the same top sign must hold before it is shown (live_clean.py STABLE_FRAMES)

# name -> (folder, parity fixture, sign kind)
HEAD_SPECS = {
    "alphabet": (ROOT / "model_aug", "parity_test.json", "letter"),
    "digit": (ROOT / "model_digits_v3", "prediction_test.json", "digit"),
    "phrase": (ROOT / "model_phrases", "parity_test.json", "word"),
}
PARITY_FEATURE_TOL = 1e-4
PARITY_PROB_TOL = 1e-4


class Head:
    """One exported classifier: config + labels + MLP layers."""

    def __init__(self, name: str, folder: Path, kind: str):
        self.name, self.folder, self.kind = name, folder, kind
        cfg = json.loads((folder / "config.json").read_text("utf-8"))
        labels = [str(x) for x in json.loads((folder / "labels.json").read_text("utf-8"))]
        if cfg.get("features") != 161 or cfg.get("two_hand") is not True or cfg.get("rotate") is not False or cfg.get("extras") is not True:
            raise ValueError(f"{folder.name}: preprocessing settings do not match the live pipeline")
        layers = json.loads((folder / "model.json").read_text("utf-8"))["layers"]
        self.layers = [(np.asarray(L["W"], np.float64), np.asarray(L["b"], np.float64), L["activation"]) for L in layers]
        if self.layers[-1][0].shape[1] != len(labels):
            raise ValueError(f"{folder.name}: {len(labels)} labels but the model outputs {self.layers[-1][0].shape[1]}")
        self.cfg, self.labels = cfg, labels

    @property
    def threshold(self) -> float:
        return float(self.cfg.get("threshold", 0.8))

    def aspect_for(self, frame_aspect: float) -> float:
        """Alphabet: the camera frame's aspect. Digits/phrases: the aspect in their config (as live_clean.py)."""
        return float(self.cfg.get("aspect", 1.0)) if self.name == "alphabet" else float(self.cfg.get("aspect", frame_aspect))

    def forward(self, x: np.ndarray) -> np.ndarray:
        a = np.asarray(x, np.float64)
        for W, b, act in self.layers:
            a = a @ W + b
            if act == "relu":
                a = np.maximum(a, 0)
            else:  # softmax
                a = np.exp(a - a.max())
                a = a / a.sum()
        return a

    def classify(self, hands_sorted, frame_aspect: float) -> Optional[np.ndarray]:
        x = F.build_features(hands_sorted, two_hand=True, rotate=False, aspect=self.aspect_for(frame_aspect), extras=True)
        return None if x is None else self.forward(x)


_heads: dict = {}
_parity: dict = {"ok": False, "heads": {}}


def load() -> None:
    global _heads, _parity
    _heads = {name: Head(name, folder, kind) for name, (folder, _, kind) in HEAD_SPECS.items()}
    _parity = parity_check()


def heads() -> dict:
    if not _heads:
        load()
    return _heads


def all_labels() -> list:
    """Every sign in one list, in a fixed order: letters, digits, phrases."""
    out = []
    for name in ("alphabet", "digit", "phrase"):
        out += [(name, k) for k in heads()[name].labels]
    return out


def parity_check() -> dict:
    """Recomputes each teammate fixture with the same code path the server uses. A head must match or the app refuses it."""
    report = {}
    for name, (folder, fixture, _) in HEAD_SPECS.items():
        p = json.loads((folder / fixture).read_text("utf-8"))
        head = _heads[name]
        hands = F.sort_hands([np.asarray(h, np.float32) for h in p["raw_hands"]])
        x = F.build_features(hands, two_hand=True, rotate=False, aspect=head.aspect_for(float(p["aspect"])), extras=True)
        fd = float(np.abs(x - np.asarray(p["expected_features"], np.float32)).max())
        pd = float(np.abs(head.forward(x) - np.asarray(p["expected_probabilities"])).max())
        report[name] = {"ok": fd < PARITY_FEATURE_TOL and pd < PARITY_PROB_TOL, "max_feature_diff": fd, "max_prob_diff": pd, "fixture": f"{folder.name}/{fixture}"}
    return {"ok": all(r["ok"] for r in report.values()), "heads": report}


def parity() -> dict:
    heads()
    return _parity
