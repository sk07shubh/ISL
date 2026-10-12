# ISL Interpreter (Hacktopia 2026, PS 06)

Real-time Indian Sign Language to text, in the browser. Model: **venmugilrajan/SignLens-Landmark-Model** (pretrained, Apache-2.0, 35 classes: 1-9, A-Z). No training happens in this app.

## Run it
1. `python scripts/setup.py`  (installs the backend, builds the frontend if Node is present, downloads the two model files)
2. `python scripts/run.py`
3. Open http://localhost:8000 (camera needs localhost or https)

If setup cannot download a file, the app says exactly which file is missing and where to save it:
- `mediapipe/hand_landmarker.task` from storage.googleapis.com (MediaPipe)
- `model/isl_landmarks_weights.json` from huggingface.co/venmugilrajan/SignLens-Landmark-Model

## Screens
- **Interpreter**: live webcam, hand skeleton, recognised sign with hold ring, top 3, sentence builder (Speak / Space / Back / Clear), "Signs I know" practice tiles, settings drawer.
- **Live test**: guided accuracy test. Each sign is shown in turn and the app records what it read, or that it stayed Uncertain.
- **Model & results**: the author's published numbers, clearly labelled as self-reported, next to our own measured live-test results.

## Important: calibrate once
The model card gives the 156-value input size but not the exact ordering of coordinates, angles and hand slots. The app therefore includes a **Calibrate** step: show a sign you know and it picks the feature layout under which the model recognises it best. Until calibration is done, the app shows a warning.

## Accuracy
Do not quote the 98% figure as our result. It is the author's block-split test. Their own card says realistic accuracy is about 96.5-98%, and ASL is about 95% across sessions. Our numbers come only from the Live test, and they should be measured on people who did not calibrate or practise the app.

## Backend API
- `GET /health`, `GET /api/vocabulary`, `GET /api/model`
- `POST /api/live-tests`, `GET /api/live-tests`, `DELETE /api/live-tests/{tester}`
- Interactive docs: http://localhost:8000/docs

## Tests
- Frontend: `cd frontend && npm test`
- Build: `cd frontend && npm run build`

## Folder map
- `frontend/src/lib/signlens.ts`: 156-value feature builder (24 candidate layouts) and the SignLens MLP forward pass
- `frontend/src/lib/gate.ts`: confidence gate (threshold, margin, smoothing, hold, release)
- `frontend/src/lib/tracker.ts`: two-hand MediaPipe tracker
- `backend/data/vocabulary.json`: the 35 classes, names and notes
- `model/`: config, labels, model card (weights downloaded by setup)
