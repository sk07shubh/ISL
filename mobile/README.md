# ISL Interpreter — Android app

This app opens the hosted ISL Interpreter website in an Android WebView, with camera access.
It needs the backend (Railway) to be running.

## One-time setup
1. Install Node.js LTS, then in this folder: `npm install`
2. Create a free Expo account at expo.dev, then `npx eas-cli login`
3. Run `npx eas-cli init` once. It fills in `extra.eas.projectId` in `app.json`.
4. In `eas.json`, replace `https://REPLACE-WITH-YOUR-RAILWAY-URL` with your Railway address.

## Build an APK
```
npx eas-cli build -p android --profile preview
```
EAS builds in the cloud and gives you a download link for the APK. Install it on an Android phone.
Use `--profile production` for an Android App Bundle (AAB) for the Play Store.

## Test on your phone before building
```
npx expo start
```
Scan the QR code with the Expo Go app. Expo Go uses the URL in `EXPO_PUBLIC_APP_URL`, so set it in your shell first:
`EXPO_PUBLIC_APP_URL=https://your-railway-url npx expo start`

## Limits of this version
- Recognition still runs on the server, so each frame waits for a network round trip.
  See the latency notes: the on-device version is the next step for faster conversation.
- The app is the web interface, so camera behaviour depends on Android WebView. Test on a real phone.
