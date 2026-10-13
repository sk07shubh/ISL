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
python3 training/live_clean.py
```
Press **C** for all three models together (default), **A** letters, **D** digits, **P** phrases, **Q** to quit.

## Three models, one webcam
| Model | Folder | Signs |
|---|---|---|
| Letters | `model_aug/` | A–Z |
| Digits | `model_digits_v3/` | 0–9 |
| Phrases | `model_phrases/` | answer, book, break, how are you, i need help, mistake, please, stop, this, where |

Every frame, the browser sends the hand points once. The backend runs all three classifiers, and the app applies the same rules as `live_clean.py`: each model is averaged over 8 frames, a sign counts only above its model's threshold, the sign must stay the top choice for 5 frames, and the most confident counted sign wins.

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
model_aug/          letters: model.json (exported weights), labels.json, config.json, parity_test.json, joblib original
model_digits_v3/    digits: same layout, from the teammate's update
model_phrases/      phrases: same layout, from the teammate's update
training/           teammate's training and live scripts (live_clean.py runs all three models)
mediapipe/wasm/     MediaPipe runtime files for the browser
scripts/            setup.py, run.py
```

## Updating the model
When the classifier is retrained, export the new `model.json`, `labels.json`, `config.json`, and `parity_test.json` into `model_aug/`, then restart `run.py`. The backend refuses to start if the parity check fails.

## Limitations
- All signs are single static shapes. Continuous signing and full sentences are not recognised.
- The phrase model's test split is small (the teammate's metrics show about 92% accuracy). Treat that as an estimate.
- The test metrics included in the training repo are not repeated here. Accuracy shown in the app is what the Live test measures.

## Test metrics
Live tests (**Live test** page) record, for every letter asked: what the app showed, its confidence, how long it took, the hand size, and the brightness. The **Model & results** page computes everything on the backend (`backend/app/analytics.py`, unit-tested with `python3 -m unittest backend/tests/test_analytics.py`).

- **Unseen-signer accuracy**: accuracy on tests where the signer was marked as not in the training data (the PS measure). Tests with signer type "not recorded" never count as unseen.
- **Wrong signs shown**: attempts where the app displayed a wrong sign. The PS asks us to avoid confident wrong answers, so the target is 2% or less.
- **Coverage**: attempts where a sign was shown. The rest stayed Uncertain.
- **Precision when shown**: of the shown signs, the share that were correct.
- **Per-sign precision, recall, F1**: precision uses shown predictions; recall uses all attempts for that letter, so abstentions count as misses.
- **Risk-coverage**: how coverage, precision, and wrong-shown rate change with the confidence threshold. The recommended threshold is the one with the most coverage that keeps wrong-shown under the target (needs at least 20 attempts).
- **Calibration (ECE)**: within each confidence band, the gap between stated confidence and how often the top prediction was right.
- **Conditions**: accuracy broken down by signer, lighting, distance (recorded by the tester), hand size, and measured brightness. The hand-size and brightness bands are provisional and should be tuned on real data.

## Hosting
The repo includes a `Dockerfile`. The container starts `scripts/run.py`, which listens on the `PORT` that the hosting platform provides.
- Set `ISL_DB=/data/isl.db` and attach a persistent volume at `/data`, so live-test results survive restarts.
- Check the service with `GET /health`. It reports the model files and the parity check.
- Camera access in the browser needs HTTPS. Most platforms provide this automatically.
