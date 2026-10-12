import { useCallback, useEffect, useRef, useState } from "react";

export type CamStatus = "idle" | "starting" | "ready" | "blocked" | "nocamera";

export function useCamera(deviceId: string, enabled = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [label, setLabel] = useState("");
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) { setStatus("idle"); return; }
    let stream: MediaStream | null = null; let dead = false;
    setStatus("starting");
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus("nocamera"); return; }
      const base = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
      try {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base, audio: false }); }
        catch (e: any) { if (deviceId && e?.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); else throw e; }
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        setLabel(stream.getVideoTracks()[0]?.label || "camera");
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
        setStatus("ready");
      } catch (e: any) {
        setStatus(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "blocked" : "nocamera");
      }
    })();
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [deviceId, enabled, nonce]);

  return { videoRef, status, devices, label, retry };
}
