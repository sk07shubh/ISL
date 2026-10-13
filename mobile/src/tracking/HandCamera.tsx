import { useEffect, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { NativeHandCamera } from "../../modules/hand-tracker";
import { C } from "../theme";

/** A frame of hand points from the native camera module: 21 [x, y, z] points per hand, and the frame's size. */
export interface HandFrame { hands: [number, number, number][][]; width: number; height: number; timestamp: number }

/**
 * Live camera with on-phone hand tracking. Asks for camera permission first; then the native module
 * starts the camera and calls onFrame for every frame.
 */
export function HandCamera({ active, onFrame, style }: { active: boolean; onFrame: (f: HandFrame) => void; style?: StyleProp<ViewStyle> }) {
  const [granted, setGranted] = useState<boolean | null>(null);

  const ask = async () => {
    if (Platform.OS !== "android") { setGranted(false); return; }
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: "Camera access", message: "The interpreter reads hand signs from the camera. Video stays on this phone.",
      buttonPositive: "Allow", buttonNegative: "Not now",
    });
    setGranted(res === PermissionsAndroid.RESULTS.GRANTED);
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA).then(setGranted);
  }, []);

  if (granted === null) return <View style={[st.box, style]} />;
  if (!granted) return (
    <View style={[st.box, style]}>
      <Pressable onPress={ask} accessibilityRole="button" style={st.allow}><Text style={st.allowText}>Allow camera</Text></Pressable>
    </View>
  );
  return <NativeHandCamera active={active} style={style} onHands={(e) => onFrame(e.nativeEvent as HandFrame)} />;
}

const st = StyleSheet.create({
  box: { backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  allow: { backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  allowText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
