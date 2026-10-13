import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

/** The camera screens run in landscape. The model was trained on landscape webcam frames, so this keeps the geometry the same. */
export function useLandscape() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => { ScreenOrientation.unlockAsync().catch(() => {}); };
  }, []);
}
