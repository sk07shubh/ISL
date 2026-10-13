import { requireNativeView } from "expo";
import type { ViewProps } from "react-native";

/** Native camera view: CameraX preview + MediaPipe hand tracking. Android only in this version. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const NativeHandCamera = requireNativeView<ViewProps & { active: boolean; onHands: (e: { nativeEvent: any }) => void }>("HandTracker");
