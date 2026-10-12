# ISL Interpreter

Real-time Indian Sign Language recognition in the browser, with the trained classifier running in the backend.

- **Hand tracking**: MediaPipe HandLandmarker (`model/hand_landmarker.task`), in the browser.
- **Classifier**: the MLP trained by the team (`model_aug/`), run by the backend. Preprocessing is `backend/app/features.py`, a byte-identical copy of `training/features.py`.
- **Parity**: on every start the backend recomputes the saved fixture `model_aug/parity_test.json` and reports the result on the Results screen. The current check gives 0.0 feature difference and 1.8e-13 probability difference.

## Run the web app
```
python3 scripts/setup.py     # once: installs the backend packages
python3 scripts/run.py       # then open http://localhost:8000 in Chrome or Edge
```
Allow camera access. Hold a sign steady for about half a second to add it to the sentence.

## Run the desktop webcam demo (teammate's workflow)
```
python3 training/live_clean.py --model-dir model_aug --smooth 8
```
Press **A** for alphabet, **D** for digits 1–9, **Q** to quit. Digit mode needs the `model_digits/` folder, which is not in the repo yet.

## Screens
- **Interpreter**: live camera, skeleton, recognised letter with hold ring, top 3, sentence builder (Speak / Space / Back / Clear), "Signs I know" practice tiles.
- **Live test**: a guided test. Each letter is shown in turn and the app records what it read, or that it stayed uncertain.
- **Model & results**: parity check, our live-test results, and per-letter hit rates.

## Recognition rules
Probabilities are averaged over the last 8 frames (`--smooth 8`). A letter is shown only when that average reaches 0.8 (`threshold` in `model_aug/config.json`). A letter is added to the sentence after it is held for 600 ms.

## Layout
```
backend/app/        API (main.py), classifier (inference.py), features.py (= training/features.py), SQLite for live tests
frontend/           React + Vite app (built into frontend/dist, which is committed)
model/              hand_landmarker.task (MediaPipe)
model_aug/          trained classifier: model.json (exported weights), labels.json, config.json, parity_test.json,
                    isl_clean_mlp.joblib (the scikit-learn original)
training/           teammate's training and live scripts (unchanged)
mediapipe/wasm/     MediaPipe runtime files for the browser
scripts/            setup.py, run.py
```

## Updating the model
When the classifier is retrained, export the new `model.json`, `labels.json`, `config.json`, and `parity_test.json` into `model_aug/`, then restart `run.py`. The backend refuses to start if the parity check fails.

## Limitations
- Static letters only. Continuous signing and full sentences are not recognised.
- The test metrics included in the training repo are not repeated here. Accuracy shown in the app is what the Live test measures.
