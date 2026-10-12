"""Runs the trained ISL classifier for the web app.

Same pipeline as training/live_clean.py:
  * preprocessing: backend/app/features.py, a byte-identical copy of training/features.py
  * model: model_aug/model.json, exported from isl_clean_mlp.joblib. Its forward pass is
    replicated here in NumPy (no scikit-learn needed). parity_check() proves the two agree.
"""
import json
from typing import Optional
from pathlib import Path

import numpy as np

from . import features as F

ROOT = Path(__file__).resolve().parents[2]
ALPHA_DIR = ROOT / "model_aug"
DIGIT_DIR = ROOT / "model_digits"          # optional: teammate has not pushed this folder yet
TASK_FILE = ROOT / "model" / "hand_landmarker.task"
PARITY_FILE = ALPHA_DIR / "parity_test.json"
SMOOTH = 8                                  # same as: live_clean.py --smooth 8


class Head:
    """One exported classifier: config + labels + MLP layers."""

    def __init__(self, folder: Path):
        cfg = json.loads((folder / "config.json").read_text("utf-8"))
        labels = [str(x) for x in json.loads((folder / "labels.json").read_text("utf-8"))]
        if cfg.get("features") != 161 or cfg.get("two_hand") is not True or cfg.get("rotate") is not False or cfg.get("extras") is not True:
            raise ValueError(f"{folder.name}: preprocessing settings do not match the live pipeline")
        layers = json.loads((folder / "model.json").read_text("utf-8"))["layers"]
        self.layers = [(np.asarray(L["W"], np.float64), np.asarray(L["b"], np.float64), L["activation"]) for L in layers]
        if self.layers[-1][0].shape[1] != len(labels):
            raise ValueError(f"{folder.name}: {len(labels)} labels but the model outputs {self.layers[-1][0].shape[1]}")
        self.cfg, self.labels, self.name = cfg, labels, folder.name

    @property
    def threshold(self) -> float:
        return float(self.cfg.get("threshold", 0.8))

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

    def classify(self, hands, aspect: float):
        """hands: list of (21,3) arrays from MediaPipe. Returns probs or None if no usable hand."""
        arrs = [np.asarray(h, np.float32) for h in hands]
        if not arrs:
            return None
        arrs = F.sort_hands(arrs)
        x = F.build_features(arrs, two_hand=True, rotate=False, aspect=aspect, extras=True)
        return None if x is None else self.forward(x)


_alpha: Optional[Head] = None
_digit: Optional[Head] = None
_parity: dict = {"ok": False, "detail": "not run"}


def load() -> None:
    global _alpha, _digit, _parity
    _alpha = Head(ALPHA_DIR)
    _digit = Head(DIGIT_DIR) if (DIGIT_DIR / "model.json").exists() else None
    _parity = parity_check()


def alpha() -> Head:
    if _alpha is None:
        load()
    return _alpha


def digit() -> Optional[Head]:
    if _alpha is None:
        load()
    return _digit


def parity_check() -> dict:
    """Recomputes the teammate's saved fixture. Passes only if features and probabilities match."""
    p = json.loads(PARITY_FILE.read_text("utf-8"))
    head = Head(ALPHA_DIR)
    hands = [np.asarray(h, np.float32) for h in p["raw_hands"]]
    arrs = F.sort_hands(hands)
    x = F.build_features(arrs, two_hand=True, rotate=False, aspect=float(p["aspect"]), extras=True)
    fd = float(np.abs(x - np.asarray(p["expected_features"], np.float32)).max())
    pd = float(np.abs(head.forward(x) - np.asarray(p["expected_probabilities"])).max())
    ok = fd < 1e-4 and pd < 1e-6
    return {"ok": ok, "max_feature_diff": fd, "max_prob_diff": pd, "fixture": "model_aug/parity_test.json"}


def parity() -> dict:
    alpha()
    return _parity
