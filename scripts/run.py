"""Start the app on this laptop: classifier + hand-tracking files + built frontend.
   python3 scripts/run.py [--port 8000] [--lan]
Open http://localhost:8000 (the camera needs localhost or https)."""
import argparse, os, pathlib, sys
ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))   # hosting platforms set PORT
ap.add_argument("--lan", action="store_true", help="listen on the local network")
a = ap.parse_args()
hosted = "PORT" in os.environ                                                     # on a server, listen on all interfaces
try:
    import uvicorn
except ImportError:
    sys.exit("Missing packages. Run: python3 scripts/setup.py")
if not (ROOT / "model_aug" / "model.json").exists():
    sys.exit("model_aug/model.json is missing. Pull the latest repo.")
if not (ROOT / "model" / "hand_landmarker.task").exists():
    sys.exit("model/hand_landmarker.task is missing. Pull the latest repo.")
uvicorn.run("backend.app.main:app", host="0.0.0.0" if (a.lan or hosted) else "127.0.0.1", port=a.port, app_dir=str(ROOT))
