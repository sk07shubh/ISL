"""Download the two files that are not in the zip (they live on Google / Hugging Face), once.
After this the whole demo runs offline.
  1. mediapipe/hand_landmarker.task            (Google MediaPipe hand tracker)
  2. model/isl_landmarks_weights.json          (venmugilrajan/SignLens-Landmark-Model, Apache-2.0)
  3. model/confusion_matrix_isl.png, isl_f1_score_breakdown.png   (charts from the model card, optional)"""
import pathlib, sys, urllib.request
ROOT = pathlib.Path(__file__).parents[1]
HF = "https://huggingface.co/venmugilrajan/SignLens-Landmark-Model/resolve/main/"
FILES = [
    (ROOT / "mediapipe/hand_landmarker.task", "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", 1_000_000, True),
    (ROOT / "model/isl_landmarks_weights.json", HF + "isl_landmarks_weights.json", 1_000_000, True),
    (ROOT / "model/confusion_matrix_isl.png", HF + "confusion_matrix_isl.png", 1000, False),
    (ROOT / "model/isl_f1_score_breakdown.png", HF + "isl_f1_score_breakdown.png", 1000, False),
]
bad = 0
for dest, url, min_size, required in FILES:
    dest.parent.mkdir(exist_ok=True)
    if dest.exists() and dest.stat().st_size >= min_size:
        print("ok      ", dest.relative_to(ROOT)); continue
    print("fetching", dest.relative_to(ROOT), "...")
    try:
        urllib.request.urlretrieve(url, dest)
        print("saved   ", dest.relative_to(ROOT), f"({dest.stat().st_size / 1e6:.1f} MB)")
    except Exception as e:
        print(f"FAILED  {dest.relative_to(ROOT)}: {e}\n        Download it in a browser from {url}\n        and save it as {dest}")
        bad += required
sys.exit(1 if bad else 0)
