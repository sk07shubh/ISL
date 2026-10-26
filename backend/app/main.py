"""ISL Interpreter backend (FastAPI + SQLite).

Three trained classifiers run HERE on every frame:
  alphabet (A-Z), digits (0-9), phrases (10 phrases)
Browser: camera + MediaPipe hand points -> POST /api/predict -> probabilities for all three models.
Run:  python3 scripts/run.py      API docs: http://localhost:8000/docs
"""
import json
import re
from typing import List, Literal, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import analytics as A
from . import db as D
from . import features as F
from . import inference as I

ROOT = D.ROOT
DIST = ROOT / "frontend" / "dist"
HOLD_MS, RELEASE_MS = 600, 300     # a sign must be held this long before it is added to the sentence

app = FastAPI(title="ISL Interpreter API", version="4.0.0",
              description="Alphabet, digit and phrase classifiers from training/live_clean.py, run in the backend. Live predictions via /api/predict.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    D.init_db()
    I.load()


class HandsIn(BaseModel):
    hands: List[List[List[float]]] = Field(max_length=2, description="Up to 2 hands, each 21 points of [x, y, z] (MediaPipe normalised)")
    aspect: float = Field(gt=0.1, lt=10, description="Camera frame width / height")


class Attempt(BaseModel):
    target: str
    predicted: Optional[str] = Field(default=None, description="Committed sign, or null if the app stayed unsure until timeout")
    confidence: Optional[float] = None
    margin: Optional[float] = None
    top_label: Optional[str] = Field(default=None, description="Best sign at the moment of decision, shown or not")
    top_conf: Optional[float] = None
    elapsed_ms: Optional[int] = Field(default=None, ge=0, le=600000)
    hand_size: Optional[float] = Field(default=None, ge=0, le=2)
    brightness: Optional[float] = Field(default=None, ge=0, le=255)


class TestIn(BaseModel):
    tester: str = Field(pattern=r"^[A-Za-z0-9_ -]{1,16}$", description="Optional name or code")
    lighting: Optional[Literal["bright", "dim", "mixed"]] = None
    distance: Optional[Literal["near", "medium", "far"]] = None
    note: Optional[str] = None
    attempts: List[Attempt] = Field(min_length=1, max_length=500)


def _all_head_info():
    out = {}
    for name, h in I.heads().items():
        out[name] = {"name": f"{h.folder.name}", "labels": h.labels, "threshold": h.threshold, "features": h.cfg["features"],
                     "aspect": h.cfg.get("aspect"), "kind": h.kind}
    return out


def _vocab_entries():
    """Every sign the app can produce, with how to show and speak it."""
    entries = []
    for name, key in I.all_labels():
        h = I.heads()[name]
        if h.kind == "letter":
            entries.append({"key": key, "group": "Letters", "kind": "letter", "name": key, "short": key, "speak": None})
        elif h.kind == "digit":
            entries.append({"key": key, "group": "Digits", "kind": "digit", "name": key, "short": key, "speak": None})
        else:
            entries.append({"key": key, "group": "Phrases", "kind": "word", "name": key, "short": key, "speak": key})
    for e in entries:
        e.update({"names": {"en": e["name"]}, "category": e["group"], "description": "", "image": "", "verified": False, "active": True, "note": ""})
    return entries


@app.get("/health", tags=["ops"])
def health():
    p = I.parity()
    return {"status": "ok", "heads": sorted(I.heads().keys()), "tracker_file": I.TASK_FILE.exists(), "parity_ok": p["ok"], "time": D.now()}


@app.get("/api/model", tags=["model"])
def model_info():
    heads = _all_head_info()
    return {"heads": heads, "labels": [e["key"] for e in _vocab_entries()],
            "gate": {"threshold": min(h["threshold"] for h in heads.values()), "smooth": I.SMOOTH, "stable": I.STABLE,
                     "hold_ms": HOLD_MS, "release_ms": RELEASE_MS},
            "parity": I.parity(), "source": "training/live_clean.py (model_aug, model_digits_v3, model_phrases)"}


@app.get("/api/vocabulary", tags=["vocabulary"])
def vocabulary():
    return {"signs": _vocab_entries()}


@app.post("/api/predict", tags=["live"])
def predict(body: HandsIn):
    """One frame of hand points -> per-head probabilities + the arbitrated winner (as live_clean.py combined mode).

    The winner field mirrors the combined-mode decision tree in live_clean.py exactly:
      - hand-count structural filtering (1-handed vs 2-handed signs)
      - B vs break priority rule
      - please/how are you overlap override
      - phrase precedence with mistake/digit exception
    Smoothing and stability tracking are done by the frontend using the raw heads probs.
    """
    for h in body.hands:
        if len(h) != 21 or any(len(p) != 3 for p in h):
            raise HTTPException(422, "each hand must have 21 points of [x, y, z]")
    hands = F.sort_hands([np.asarray(h, np.float32) for h in body.hands])
    out = {}
    for name, head in I.heads().items():
        probs = head.classify(hands, body.aspect) if hands else None
        out[name] = None if probs is None else {"probs": [round(float(p), 6) for p in probs], "labels": head.labels}

    # Build candidates that pass each head's effective threshold (phrase uses 0.9x as in live_clean.py)
    candidates = []
    for name, head in I.heads().items():
        res = out[name]
        if res is None:
            continue
        probs_list = res["probs"]
        labels = res["labels"]
        best_j = int(np.argmax(probs_list))
        confidence = probs_list[best_j]
        if confidence >= head.effective_threshold:
            candidates.append({
                "name": name,
                "prediction": labels[best_j],
                "confidence": confidence,
            })

    num_hands = len(body.hands)
    winner_cand = I.arbitrate(candidates, num_hands)
    winner = None
    if winner_cand is not None:
        winner = {
            "label": winner_cand["prediction"],
            "confidence": round(winner_cand["confidence"], 6),
            "source": winner_cand["name"],
        }

    reason = None if any(v for v in out.values()) else "no_usable_hand"
    return {"heads": out, "winner": winner, "reason": reason}


@app.post("/api/live-tests", status_code=201, tags=["live tests"])
def save_test(body: TestIn):
    with D.db() as con:
        tid = con.execute(
            "INSERT INTO live_tests(tester,created_at,note,lighting,distance) VALUES(?,?,?,?,?) RETURNING id",
            (body.tester, D.now(), body.note, body.lighting, body.distance),
        ).fetchone()["id"]
        con.executemany(
            "INSERT INTO live_attempts(test_id,target,predicted,confidence,margin,top_label,top_conf,elapsed_ms,hand_size,brightness) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            [(tid, a.target, a.predicted, a.confidence, a.margin, a.top_label, a.top_conf, a.elapsed_ms, a.hand_size, a.brightness)
             for a in body.attempts])
    return {"id": tid, "attempts": len(body.attempts)}


def _attempt_rows(lighting=None, distance=None):
    q = ("SELECT a.test_id, t.tester, t.lighting, t.distance, a.target, a.predicted, a.confidence, a.margin, "
         "a.top_label, a.top_conf, a.elapsed_ms, a.hand_size, a.brightness "
         "FROM live_attempts a JOIN live_tests t ON t.id = a.test_id WHERE 1=1")
    args = []
    for col, val in (("t.lighting", lighting), ("t.distance", distance)):
        if val:
            q += f" AND {col} = ?"
            args.append(val)
    with D.db() as con:
        return [dict(r) for r in con.execute(q + " ORDER BY a.id", args)]


@app.get("/api/analytics", tags=["live tests"])
def analytics_endpoint(lighting: Optional[Literal["bright", "dim", "mixed"]] = None, distance: Optional[Literal["near", "medium", "far"]] = None):
    """Live-test metrics, filtered by lighting and distance. All numbers are computed here."""
    labels = [e["key"] for e in _vocab_entries()]
    thr = min(h.threshold for h in I.heads().values())
    rows = _attempt_rows(lighting, distance)
    filters = {"lighting": lighting, "distance": distance}
    return {**A.analytics(rows, thr, labels, filters), "parity_ok": I.parity()["ok"]}


@app.get("/api/live-tests", tags=["live tests"])
def live_tests():
    with D.db() as con:
        tests = [dict(r) for r in con.execute(
            "SELECT t.id,t.tester,t.created_at,t.lighting,t.distance,COUNT(a.id) attempts, " 
            "SUM(CASE WHEN a.predicted = a.target THEN 1 ELSE 0 END) correct "
            "FROM live_tests t LEFT JOIN live_attempts a ON a.test_id=t.id GROUP BY t.id ORDER BY t.id DESC")]
        attempts = [dict(r) for r in con.execute(
            "SELECT t.tester, a.target, a.predicted, a.confidence, a.margin FROM live_attempts a JOIN live_tests t ON t.id=a.test_id "
            "ORDER BY a.id DESC LIMIT 20000")]
    return {"tests": tests, "attempts": attempts}


@app.delete("/api/live-tests/{tester}", tags=["live tests"])
def delete_tester(tester: str):
    if not re.match(r"^[A-Za-z0-9_ -]{1,16}$", tester):
        raise HTTPException(422, "bad tester code")
    with D.db() as con:
        n = con.execute("DELETE FROM live_tests WHERE tester=?", (tester,)).rowcount
    return {"deleted_runs": n}


@app.api_route("/mediapipe/hand_landmarker.task", methods=["GET", "HEAD"], include_in_schema=False)
def tracker_model():
    if not I.TASK_FILE.exists():
        raise HTTPException(404, "model/hand_landmarker.task is missing")
    return FileResponse(I.TASK_FILE, media_type="application/octet-stream")


@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


app.mount("/mediapipe/wasm", StaticFiles(directory=ROOT / "mediapipe" / "wasm"), name="wasm")
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith(("api/", "mediapipe/")):
        raise HTTPException(404)
    f = DIST / full_path
    if full_path and f.is_file() and DIST in f.resolve().parents:
        return FileResponse(f)
    if (DIST / "index.html").exists():
        return FileResponse(DIST / "index.html")
    return JSONResponse({"detail": "Frontend not built. Run: python3 scripts/setup.py. API docs at /docs"})
