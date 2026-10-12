import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chip, Icon } from "./ui";
import { useSettings } from "../lib/settings";
import { useCamera } from "../lib/useCamera";
import { Engine, type FrameInfo } from "../lib/engine";
import { getTracker, resetTracker, type Tracker } from "../lib/tracker";
import { gateConfig, loadModel, resetRuntime } from "../lib/runtime";
import { Gate } from "../lib/gate";
import type { Mode } from "../lib/api";
import { AppError, type GateOutput, type ModelInfo } from "../lib/types";

export interface StageState { phase: "loading" | "ready" | "blocked" | "nocamera" | "error"; error?: AppError; camLabel: string; info: ModelInfo | null }
interface Props {
  mode: Mode; compact?: boolean;
  onFrame?: (f: FrameInfo) => void; onView?: (f: FrameInfo | null) => void;
  onCommit?: (label: string, g: GateOutput) => void; onState?: (s: StageState) => void;
  overlay?: (f: FrameInfo | null) => ReactNode;
}

/** Webcam + hand skeleton + status chip, and every stage state: loading, camera blocked, no camera, missing file. */
export function Stage(p: Props) {
  const { s } = useSettings();
  const cam = useCamera(s.deviceId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef(p); cb.current = p;
  const opt = useRef(s); opt.current = s;
  const snap = useRef<FrameInfo | null>(null);
  const [view, setView] = useState<FrameInfo | null>(null);
  const [load, setLoad] = useState<{ state: "loading" | "ready" | "error"; step: string; error?: AppError }>({ state: "loading", step: "Starting…" });
  const [assets, setAssets] = useState<{ tracker: Tracker; info: ModelInfo } | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let dead = false;
    setLoad({ state: "loading", step: "Loading hand tracker (MediaPipe)…" });
    (async () => {
      try {
        const tracker = await getTracker();
        if (!dead) setLoad({ state: "loading", step: "Connecting to the classifier…" });
        const info = await loadModel();
        if (dead) return;
        setAssets({ tracker, info }); setLoad({ state: "ready", step: "Ready" });
      } catch (e) {
        if (!dead) setLoad({ state: "error", step: "", error: e instanceof AppError ? e : new AppError("bad_file", "backend", String((e as Error)?.message ?? e)) });
      }
    })();
    return () => { dead = true; };
  }, [tries]);

  const phase: StageState["phase"] = load.state === "error" ? "error" : load.state === "loading" ? "loading"
    : cam.status === "blocked" ? "blocked" : cam.status === "nocamera" ? "nocamera" : cam.status === "ready" ? "ready" : "loading";
  useEffect(() => { p.onState?.({ phase, error: load.error, camLabel: cam.label, info: assets?.info ?? null }); }, [phase, load.error, cam.label, assets]);

  useEffect(() => {
    if (phase !== "ready" || !assets) return;
    const head = p.mode === "digit" ? assets.info.digit : assets.info.alphabet;
    if (!head) return;
    const eng = new Engine({
      video: cam.videoRef.current, canvas: canvasRef.current, tracker: assets.tracker, mode: p.mode, smooth: assets.info.gate.smooth,
      gate: new Gate(head.labels, gateConfig(assets.info), "__none__"), skeleton: () => opt.current.showSkeleton,
      onFrame: (f) => { snap.current = f; cb.current.onFrame?.(f); }, onCommit: (l, g) => cb.current.onCommit?.(l, g),
    });
    eng.start();
    const iv = window.setInterval(() => { setView(snap.current); cb.current.onView?.(snap.current); }, 100);   // React updates <= 10 Hz
    return () => { eng.stop(); clearInterval(iv); snap.current = null; setView(null); };
  }, [phase, assets, p.mode]);

  const g = view?.gate;
  const chip = phase === "loading" ? <Chip kind="load" pulse>Loading</Chip> : phase !== "ready" ? <Chip kind="err">Unavailable</Chip>
    : g?.state === "recognised" ? <Chip kind="ok">Recognised</Chip> : g?.state === "uncertain" ? <Chip kind="warn">Uncertain</Chip> : <Chip kind="idle">No hand</Chip>;

  return (
    <div className={`stage ${p.compact ? "compact" : ""} ${s.mirror ? "mirror" : ""} ${g?.state === "recognised" ? "is-ok" : g?.state === "uncertain" ? "is-warn" : ""}`}>
      <video ref={cam.videoRef} muted playsInline aria-label="Webcam preview" />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="hud hud-tl">
        <div role="status" aria-live="polite">{chip}</div>
        {phase === "ready" && <span className="badge mono">{p.mode === "digit" ? "digits" : "letters"} · {view ? Math.round(view.fps) : 0} fps{view && view.hands.length ? ` · ${view.hands.length} hand${view.hands.length > 1 ? "s" : ""}` : ""}</span>}
      </div>
      {phase === "ready" && cam.label && !p.compact && <div className="hud hud-br"><span className="badge"><Icon name="camera" size={14} /> {cam.label}</span></div>}
      {phase === "ready" && p.overlay?.(view)}

      {phase === "loading" && <div className="state"><div className="spinner" aria-hidden="true" /><h3>Getting ready</h3><p>{load.state === "loading" ? load.step : "Starting camera…"}</p></div>}
      {(phase === "blocked" || phase === "nocamera") && (
        <div className="state" role="alert"><Icon name="camera" size={40} />
          <h3>{phase === "blocked" ? "Camera access is blocked" : "No camera found"}</h3>
          <p>{phase === "blocked" ? "Click the camera icon in the address bar, choose Allow, then try again. Video never leaves this laptop; only hand points are sent to the classifier." : "Plug in a webcam, or pick another camera in Settings, then try again."}</p>
          <button className="btn btn-primary" onClick={cam.retry}><Icon name="refresh" size={18} /> Retry camera</button></div>
      )}
      {phase === "error" && load.error && (
        <div className="state error" role="alert"><Icon name="alert" size={40} />
          <h3>{load.error.kind === "version_mismatch" ? "Model files do not match" : "A required file is missing"}</h3>
          <p>{load.error.message}</p><code className="file">{load.error.file}</code>
          <button className="btn btn-secondary" onClick={() => { resetRuntime(); resetTracker(); setTries((n) => n + 1); }}><Icon name="refresh" size={18} /> Check again</button></div>
      )}
    </div>
  );
}
