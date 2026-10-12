"""ISL Interpreter backend (FastAPI + SQLite).

The trained model runs HERE, in the backend:
  browser (camera + MediaPipe hand tracking) -> POST /api/predict with 21 points per hand
  backend (features.py + model.json)          -> class probabilities
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

from . import db as D
from . import inference as I

ROOT = D.ROOT
DIST = ROOT / "frontend" / "dist"
HOLD_MS, RELEASE_MS = 600, 300     # sign must be held this long before it is added to the sentence

app = FastAPI(title="ISL Interpreter API", version="3.0.0",
              description="Trained ISL classifier (model_aug, from training/). Live predictions via /api/predict.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    D.init_db()
    I.load()


class HandsIn(BaseModel):
    hands: List[List[List[float]]] = Field(max_length=2, description="Up to 2 hands, each 21 points of [x, y, z] (MediaPipe normalised)")
    aspect: float = Field(gt=0.1, lt=10, description="Video width / height, as in live_clean.py")
    mode: Literal["alphabet", "digit"] = "alphabet"


class Attempt(BaseModel):
    target: str
    predicted: Optional[str] = Field(default=None, description="Committed sign, or null if the app stayed Uncertain until timeout")
    confidence: Optional[float] = None
    margin: Optional[float] = None


class TestIn(BaseModel):
    tester: str = Field(pattern=r"^[A-Za-z0-9_-]{1,16}$", description="Anonymous tester code, e.g. T01")
    note: Optional[str] = None
    attempts: List[Attempt] = Field(min_length=1, max_length=500)


def _head(mode: str) -> I.Head:
    if mode == "alphabet":
        return I.alpha()
    h = I.digit()
    if h is None:
        raise HTTPException(404, "Digit model is not installed. Add the model_digits/ folder (training/live_clean.py needs it too).")
    return h


@app.get("/health", tags=["ops"])
def health():
    return {"status": "ok", "alphabet": True, "digits": I.digit() is not None,
            "tracker_file": I.TASK_FILE.exists(), "parity_ok": I.parity()["ok"], "time": D.now()}


@app.get("/api/model", tags=["model"])
def model_info():
    a, d = I.alpha(), I.digit()
    def describe(h):
        return None if h is None else {"name": h.name, "labels": h.labels, "threshold": h.threshold,
                                       "features": h.cfg["features"], "aspect": h.cfg.get("aspect")}
    return {"alphabet": describe(a), "digit": describe(d),
            "gate": {"threshold": a.threshold, "smooth": I.SMOOTH, "hold_ms": HOLD_MS, "release_ms": RELEASE_MS},
            "parity": I.parity(), "source": "training/live_clean.py + model_aug/ (exported from isl_clean_mlp.joblib)"}


@app.get("/api/vocabulary", tags=["vocabulary"])
def vocabulary(mode: Literal["alphabet", "digit"] = "alphabet"):
    h = _head(mode)
    cat = "Numerals" if mode == "digit" else "Alphabet"
    signs = [{"key": k, "name": {"en": k}, "names": {"en": k}, "short": k, "category": cat, "description": "",
              "image": "", "verified": False, "active": True, "note": ""} for k in h.labels]
    return {"mode": mode, "signs": signs}


@app.post("/api/predict", tags=["live"])
def predict(body: HandsIn):
    """One frame of hand points -> probabilities over the classes (same as live_clean.py)."""
    for h in body.hands:
        if len(h) != 21 or any(len(p) != 3 for p in h):
            raise HTTPException(422, "each hand must have 21 points of [x, y, z]")
    head = _head(body.mode)
    aspect = head.cfg["aspect"] if body.mode == "digit" else body.aspect   # digit model uses its own training aspect
    probs = head.classify([np.asarray(h, np.float32) for h in body.hands], float(aspect))
    if probs is None:
        return {"probs": None, "labels": head.labels, "reason": "no_usable_hand"}
    return {"probs": [round(float(p), 6) for p in probs], "labels": head.labels, "reason": None}


@app.post("/api/live-tests", status_code=201, tags=["live tests"])
def save_test(body: TestIn):
    with D.db() as con:
        tid = con.execute("INSERT INTO live_tests(tester,created_at,note) VALUES(?,?,?)", (body.tester, D.now(), body.note)).lastrowid
        con.executemany("INSERT INTO live_attempts(test_id,target,predicted,confidence,margin) VALUES(?,?,?,?,?)",
                        [(tid, a.target, a.predicted, a.confidence, a.margin) for a in body.attempts])
    return {"id": tid, "attempts": len(body.attempts)}


@app.get("/api/live-tests", tags=["live tests"])
def live_tests():
    with D.db() as con:
        tests = [dict(r) for r in con.execute(
            "SELECT t.id,t.tester,t.created_at,COUNT(a.id) attempts, SUM(a.predicted=a.target) correct "
            "FROM live_tests t LEFT JOIN live_attempts a ON a.test_id=t.id GROUP BY t.id ORDER BY t.id DESC")]
        attempts = [dict(r) for r in con.execute(
            "SELECT t.tester, a.target, a.predicted, a.confidence, a.margin FROM live_attempts a JOIN live_tests t ON t.id=a.test_id "
            "ORDER BY a.id DESC LIMIT 20000")]
    return {"tests": tests, "attempts": attempts}


@app.delete("/api/live-tests/{tester}", tags=["live tests"])
def delete_tester(tester: str):
    if not re.match(r"^[A-Za-z0-9_-]{1,16}$", tester):
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
