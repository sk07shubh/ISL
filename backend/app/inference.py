"""Runs the three trained ISL classifiers (alphabet, digits, phrases) for the web app.

Same pipeline as training/live_clean.py for each model:
  * preprocessing: backend/app/features.py, a byte-identical copy of training/features.py
  * models: model.json exported from each joblib model (model_aug, model_digits_v3, model_phrases).
    The forward pass is replicated here in NumPy, so scikit-learn is not needed at runtime.
  * aspect: the alphabet model uses the camera frame aspect (1.0); digits and phrases use the
    aspect stored in their config (1.0 and 1.3333), exactly as live_clean.py does.
  * arbitrate(): mirrors the combined-mode decision tree in live_clean.py exactly.
parity_check() recomputes each teammate fixture and must match before the app starts answering.
"""
import json
from pathlib import Path
from typing import Optional

import numpy as np

from . import features as F

ROOT = Path(__file__).resolve().parents[2]
TASK_FILE = ROOT / "model" / "hand_landmarker.task"
SMOOTH = 10       # frames averaged per model (matches live_clean.py --smooth 10)
STABLE = 7        # consecutive frames the same top sign must hold (matches live_clean.py STABLE_FRAMES = 7)

# Structural hand constraints - mirrors live_clean.py exactly
ONE_HAND_PHRASES = {"please", "this", "mistake"}   # strictly single-handed in ISL
TWO_HAND_PHRASES = {"answer", "book", "break", "where"}  # two-handed gestures in ISL
ONE_HAND_LETTERS = {"C", "I", "L", "O", "U", "V"}   # only these 6 alphabet letters are one-handed

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

    @property
    def effective_threshold(self) -> float:
        """Phrase model uses 0.9x so it can compete with alphabet/digit on shared hand shapes (mirrors live_clean.py)."""
        base = self.threshold
        return base * 0.9 if self.name == "phrase" else base

    def aspect_for(self, frame_aspect: float) -> float:
        """Alphabet: always use config aspect (1.0). Digits/phrases: their own config aspect."""
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


def arbitrate(candidates: list, num_hands: int) -> Optional[dict]:
    """Apply the same decision tree as live_clean.py combined mode.

    candidates: list of dicts with keys: name, prediction, confidence
    num_hands:  number of hands MediaPipe detected this frame (0, 1, or 2)
    Returns the winning candidate dict, or None if list is empty.
    """
    if not candidates:
        return None

    # 1. Structural hand-count filtering
    valid = candidates
    if num_hands >= 2:
        # Digits and strictly single-handed phrases cannot match when 2 hands are present
        filtered = [
            c for c in valid
            if c["name"] != "digit" and c["prediction"] not in ONE_HAND_PHRASES
        ]
        if filtered:
            valid = filtered
    elif num_hands == 1:
        # 2-handed phrases and non-one-handed letters cannot match when only 1 hand is present
        filtered = [
            c for c in valid
            if not (c["name"] == "phrase" and c["prediction"] in TWO_HAND_PHRASES)
            and not (c["name"] == "alphabet" and c["prediction"] not in ONE_HAND_LETTERS)
        ]
        if filtered:
            valid = filtered

    if not valid:
        return None

    # 2. Letter 'B' vs phrase 'break' priority:
    # In ISL, 'B' is a static two-handed sign. If the alphabet model accepts 'B', it takes precedence.
    b_cand = next((c for c in valid if c["name"] == "alphabet" and c["prediction"] == "B"), None)
    if b_cand is not None:
        return b_cand

    # 3. Known overlap phrases ('please', 'how are you') override alphabet 'H' / digit '9'
    overlap_phrase = next(
        (c for c in valid if c["name"] == "phrase" and c["prediction"] in ("please", "how are you")),
        None,
    )
    if overlap_phrase is not None:
        return overlap_phrase

    phrase_cand = next((c for c in valid if c["name"] == "phrase"), None)
    digit_cand = next((c for c in valid if c["name"] == "digit"), None)

    if phrase_cand is not None:
        # 'mistake' yields to digit if digit confidence >= 0.85 (avoids digit 5/6/8 being swallowed)
        if (
            phrase_cand["prediction"] == "mistake"
            and digit_cand is not None
            and digit_cand["confidence"] >= 0.85
        ):
            return digit_cand
        # Otherwise phrase takes precedence (preserves all working phrases)
        return phrase_cand

    # Alphabet vs Digit - pick highest confidence
    return max(valid, key=lambda c: c["confidence"])


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
