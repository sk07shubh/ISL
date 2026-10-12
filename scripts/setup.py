"""One-time setup:  python3 scripts/setup.py
 1. installs the backend packages (backend/requirements.txt)
 2. builds the frontend if Node.js is installed (a built frontend/dist is already in the repo)
 3. checks that the model files are present. Nothing is downloaded: the tracker and classifier are in the repo."""
import pathlib, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).parents[1]

def run(cmd, cwd=ROOT):
    print("$", " ".join(cmd)); return subprocess.call(cmd, cwd=cwd)

run([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"])
if shutil.which("npm"):
    if run(["npm", "install"], ROOT / "frontend") == 0:
        run(["npm", "run", "build"], ROOT / "frontend")
else:
    print("Node/npm not found: using the built frontend/dist from the repo.")

missing = [p for p in ["model/hand_landmarker.task", "model_aug/model.json", "model_aug/config.json", "model_aug/labels.json",
                       "model_aug/parity_test.json", "mediapipe/wasm/vision_wasm_internal.wasm", "backend/app/features.py"]
           if not (ROOT / p).exists()]
if missing:
    print("\nMISSING FILES (pull the latest repo):\n  " + "\n  ".join(missing)); sys.exit(1)
print("\nSetup finished. Start the app with:  python3 scripts/run.py")
