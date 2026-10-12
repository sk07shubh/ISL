"""ISL Interpreter backend (FastAPI + SQLite).
Serves the built frontend, the SignLens model files, the MediaPipe runtime files and the vocabulary, and stores
live-test results. Run:  python3 scripts/run.py     API docs: http://localhost:8000/docs"""
import json
import mimetypes
import re
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db as D

mimetypes.add_type("application/wasm", ".wasm")
ROOT = D.ROOT
DIST = ROOT / "frontend" / "dist"
VOCAB = D.DATA / "vocabulary.json"

app = FastAPI(title="ISL Interpreter API", version="2.0.0",
              description="Model: venmugilrajan/SignLens-Landmark-Model (pretrained, runs in the browser). No training happens here.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    D.init_db()


class Attempt(BaseModel):
    target: str
    predicted: Optional[str] = Field(default=None, description="Committed sign, or null if the gate stayed Uncertain until timeout")
    confidence: Optional[float] = None
    margin: Optional[float] = None


class TestIn(BaseModel):
    tester: str = Field(pattern=r"^[A-Za-z0-9_-]{1,16}$", description="Anonymous tester code, e.g. T01")
    note: Optional[str] = None
    attempts: list[Attempt] = Field(min_length=1, max_length=500)


@app.get("/health", tags=["ops"])
def health():
    files = {n: (D.MODEL_DIR / n).exists() for n in ("isl_landmarks_weights.json", "labels.json", "config.json")}
    files["hand_landmarker.task"] = (ROOT / "mediapipe" / "hand_landmarker.task").exists()
    return {"status": "ok", "files": files, "time": D.now()}


@app.get("/api/vocabulary", tags=["vocabulary"])
def vocabulary():
    v = json.loads(VOCAB.read_text("utf-8"))
    out = []
    for s in v["signs"]:
        out.append({**s, "names": s["name"], "name": s["name"]["en"]})
    return {"signs": out}


@app.get("/api/model", tags=["model"])
def model_info():
    cfg = D.MODEL_DIR / "config.json"
    card = D.MODEL_DIR / "model_card.json"
    return {"config": json.loads(cfg.read_text("utf-8")) if cfg.exists() else None,
            "card": json.loads(card.read_text("utf-8")) if card.exists() else None}


@app.post("/api/live-tests", status_code=201, tags=["live tests"])
def save_test(body: TestIn):
    """Stores one practice/test run: what each sign was supposed to be and what the app committed."""
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
    """Removes every test run by this anonymous tester code."""
    if not re.match(r"^[A-Za-z0-9_-]{1,16}$", tester):
        raise HTTPException(422, "bad tester code")
    with D.db() as con:
        n = con.execute("DELETE FROM live_tests WHERE tester=?", (tester,)).rowcount
    return {"deleted_runs": n}


def _mount(url, folder):
    folder.mkdir(parents=True, exist_ok=True)
    app.mount(url, StaticFiles(directory=folder), name=url.strip("/"))


@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    if request.url.path.startswith(("/model/", "/api/")):
        resp.headers["Cache-Control"] = "no-store"
    return resp


_mount("/model", D.MODEL_DIR)
_mount("/mediapipe", ROOT / "mediapipe")
_mount("/ref", D.DATA / "ref")
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith(("api/", "model/", "mediapipe/", "ref/")):
        raise HTTPException(404)
    f = DIST / full_path
    if full_path and f.is_file() and DIST in f.resolve().parents:
        return FileResponse(f)
    if (DIST / "index.html").exists():
        return FileResponse(DIST / "index.html")
    return JSONResponse({"detail": "Frontend not built. Run: python3 scripts/setup.py. API docs at /docs"})