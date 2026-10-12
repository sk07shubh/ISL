"""One-time setup:  python scripts/setup.py
 1. pip install backend requirements  2. build the frontend if Node is installed (a prebuilt frontend/dist is in the zip)
 3. download the MediaPipe tracker and the SignLens weights."""
import pathlib, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).parents[1]
def run(cmd, cwd=ROOT):
    print("$", " ".join(cmd)); return subprocess.call(cmd, cwd=cwd, shell=(sys.platform == "win32"))
run([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"])
if shutil.which("npm"):
    if run(["npm", "install"], ROOT / "frontend") == 0:
        run(["npm", "run", "build"], ROOT / "frontend")
else:
    print("Node/npm not found: using the prebuilt frontend/dist from the zip.")
run([sys.executable, "scripts/fetch_assets.py"])
print("\nSetup finished. Start with:  python scripts/run.py")
