"""Start the whole app on one laptop: API + built frontend + model files + tracker files.
   python scripts/run.py [--port 8000] [--lan]
Open http://localhost:8000  (camera access needs localhost or https)."""
import argparse, pathlib, sys
ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8000)
ap.add_argument("--lan", action="store_true", help="listen on the local network (see README: camera needs https off-localhost)")
a = ap.parse_args()
try:
    import uvicorn
except ImportError:
    sys.exit("Missing dependencies. Run: python scripts/setup.py")
need = ROOT / "model" / "isl_landmarks_weights.json"
if not need.exists():
    print("NOTE: model/isl_landmarks_weights.json is missing - the live screen will show an error naming it.\n"
          "      Fix: python scripts/fetch_assets.py   (one download, then the demo is fully offline)\n")
uvicorn.run("backend.app.main:app", host="0.0.0.0" if a.lan else "127.0.0.1", port=a.port, app_dir=str(ROOT))
