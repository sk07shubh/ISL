# ISL Interpreter — React Native app

The same interpreter as the website, as a native Android and iOS app (Expo). It talks to the same backend.

## What's in it
- **Interpreter**: camera, recognised sign with hold ring, top 3 predictions, sentence box (Speak / Space / Delete / Clear), "Signs I know", settings.
- **Live test**: guided test with lighting and distance notes, saved to the backend.
- **Model & results**: accuracy, wrong-sign rate, answered share, safety chart, per-sign results, calibration, runs.
- Sign rules are the same as the website and `training/live_clean.py`: `src/lib/combine.ts`, `src/lib/gate.ts`, `src/lib/recognizer.ts`. Their unit tests run with `npm test`.

## What is NOT built yet
**On-phone hand tracking.** Recognition needs 21 hand points per hand from each camera frame. The website gets them from MediaPipe in the browser. A phone app needs a native MediaPipe module (Android/iOS) that exposes the same points. That module is the one missing piece; it's defined as an interface in `src/tracking/handTracker.ts`. Until it's added, the camera shows, but signs are not recognised and the app says so.

## Set up
1. Install Node.js LTS. In this folder: `npm install`
2. Set the backend address in `eas.json` (`EXPO_PUBLIC_API_URL`), e.g. your Railway URL.
3. For a quick try on a phone: `npx expo start`, then scan the QR code with Expo Go.

## Build with EAS
```
npx eas-cli login
npx eas-cli init                              # fills in extra.eas.projectId
npx eas-cli build -p android --profile preview     # APK for testing
npx eas-cli build -p android --profile production  # AAB for the Play Store
```

## Checks
- `npm run typecheck` — TypeScript
- `npm test` — sign rules and sentence logic
- `npx expo export --platform android --output-dir /tmp/out` — bundles the app for Android (done in the repo's setup)
