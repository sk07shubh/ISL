import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, PermissionsAndroid, Platform, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import WebView, { type WebViewNavigation } from "react-native-webview";

/** The website URL comes from the EAS build profile (EXPO_PUBLIC_APP_URL), e.g. your Railway address. */
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";
const INDIGO = "#4f46e5";

type Status = "checking" | "needs-camera" | "ready" | "error";

export default function App() {
  const web = useRef<WebView>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Ask for the camera once, before the web page needs it (the page then gets camera access from the app).
  const askCamera = useCallback(async () => {
    if (Platform.OS !== "android") { setStatus("ready"); return; }
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: "Camera access", message: "The interpreter reads hand signs from the camera. Video stays on this phone; only hand points are sent to the classifier.",
      buttonPositive: "Allow", buttonNegative: "Not now",
    });
    setStatus(res === PermissionsAndroid.RESULTS.GRANTED ? "ready" : "needs-camera");
  }, []);

  useEffect(() => {
    if (!APP_URL) { setStatus("error"); setLoadError("EXPO_PUBLIC_APP_URL is not set in eas.json."); return; }
    askCamera();
  }, [askCamera]);

  // Android back button goes back in the web app first.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = (e: WebViewNavigation) => setCanGoBack(e.canGoBack);

  if (status === "error") return <Message title="App not configured" body={loadError ?? "Unknown error"} />;
  if (status === "needs-camera") return <Message title="Camera needed" body="Allow the camera to use the interpreter." action="Allow camera" onAction={askCamera} />;
  if (status === "checking") return <Message title="Starting…" body="" />;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {loadError ? <Message title="Cannot reach the interpreter" body={loadError} action="Try again" onAction={() => { setLoadError(null); web.current?.reload(); }} /> : (
        <WebView
          ref={web}
          source={{ uri: APP_URL }}
          style={styles.web}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"   // the WebView grants the page camera access once the app has it
          onNavigationStateChange={onNav}
          onError={(e) => setLoadError(`Could not open ${APP_URL} (${e.nativeEvent.description}). Check your internet connection.`)}
          onHttpError={(e) => setLoadError(`The server answered with HTTP ${e.nativeEvent.statusCode}. Is the backend running?`)}
          renderLoading={() => <ActivityIndicator style={styles.loading} color={INDIGO} size="large" />}
          startInLoadingState
        />
      )}
    </SafeAreaView>
  );
}

function Message({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <SafeAreaView style={styles.msg}>
      <StatusBar style="dark" />
      <Text style={styles.title}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {action && onAction && <Pressable style={styles.button} onPress={onAction}><Text style={styles.buttonText}>{action}</Text></Pressable>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  web: { flex: 1 },
  loading: { position: "absolute", top: "50%", alignSelf: "center" },
  msg: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  title: { fontSize: 22, fontWeight: "600", color: "#0f172a", textAlign: "center" },
  body: { fontSize: 16, color: "#475569", textAlign: "center", lineHeight: 22 },
  button: { backgroundColor: INDIGO, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
