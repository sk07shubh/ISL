import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, Chip, Icon, Ring, pct } from "../components/ui";
import { Stage, type StageState } from "../components/Stage";
import { loadVocab } from "../lib/runtime";
import { saveTest, type Attempt, type TestMeta } from "../lib/api";
import type { FrameInfo } from "../lib/engine";
import type { GateOutput, Vocabulary } from "../lib/types";

const TIMEOUT_MS = 8000;
type Phase = "setup" | "run" | "done";
type Light = "bright" | "dim" | "mixed";
type Dist = "near" | "medium" | "far";

/** A simple test anyone can run: show each letter when asked. The app records what it read (or that it stayed
 *  Uncertain), how long it took, and the conditions if the tester noted them. */
export function Test() {
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [view, setView] = useState<FrameInfo | null>(null);
  const viewRef = useRef<FrameInfo | null>(null);
  const [name, setName] = useState(() => localStorage.getItem("isl.tester") || "");
  const [light, setLight] = useState<Light | null>(null);
  const [dist, setDist] = useState<Dist | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean | null; text: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const startedAt = useRef(0), lock = useRef(false), meta = useRef<TestMeta>({ tester: "anon" });
  const cur = useRef({ phase, queue, idx }); cur.current = { phase, queue, idx };

  useEffect(() => { loadVocab("alphabet").then(setVocab).catch(() => {}); }, []);
  const byKey = useMemo(() => new Map((vocab?.signs ?? []).map((v) => [v.key, v])), [vocab]);
  const pool = vocab?.signs.filter((v) => v.active) ?? [];
  const target = phase === "run" ? queue[idx] : null;
  const ready = stage?.phase === "ready";
  const nameOk = !name.trim() || /^[A-Za-z0-9_-]{1,16}$/.test(name.trim());

  const onView = useCallback((f: FrameInfo | null) => { viewRef.current = f; setView(f); }, []);

  const advance = useCallback((a: Attempt) => {
    if (lock.current) return; lock.current = true;
    setAttempts((x) => [...x, a]);
    const ok = a.predicted === a.target;
    setFeedback({ ok: a.predicted === null ? null : ok, text: a.predicted === null ? "Stayed uncertain (no wrong guess)" : ok ? "Correct" : `Read as ${byKey.get(a.predicted)?.short ?? a.predicted}` });
    window.setTimeout(() => {
      setFeedback(null); lock.current = false;
      const c = cur.current;
      if (c.idx + 1 >= c.queue.length) setPhase("done"); else { setIdx(c.idx + 1); startedAt.current = performance.now(); }
    }, 1100);
  }, [byKey]);

  /** What the app knew at the moment it decided. */
  const measure = (g: GateOutput | null, predicted: string | null, target: string): Attempt => {
    const f = viewRef.current;
    const top = g?.top?.[0];
    return {
      target, predicted, confidence: predicted ? g?.confidence ?? null : null, margin: predicted ? g?.margin ?? null : null,
      top_label: top?.label ?? null, top_conf: top?.prob ?? null,
      elapsed_ms: Math.round(performance.now() - startedAt.current),
      hand_size: f?.handSize ?? null, brightness: f ? Math.round(f.brightness) : null,
    };
  };

  const onCommit = useCallback((label: string, g: GateOutput) => {
    const c = cur.current; if (c.phase !== "run" || lock.current) return;
    advance(measure(g, label, c.queue[c.idx]));
  }, [advance]);

  useEffect(() => {   // timeout per letter: abstaining is recorded, not hidden
    if (phase !== "run") return;
    startedAt.current = performance.now();
    const iv = setInterval(() => {
      const e = performance.now() - startedAt.current; setElapsed(e);
      const c = cur.current;
      if (c.phase === "run" && e > TIMEOUT_MS && !lock.current) advance(measure(viewRef.current?.gate ?? null, null, c.queue[c.idx]));
    }, 100);
    return () => clearInterval(iv);
  }, [phase, advance]);

  useEffect(() => {   // save when finished
    if (phase !== "done" || !attempts.length) return;
    setSaved("saving"); saveTest(meta.current, attempts).then(() => setSaved("ok")).catch(() => setSaved("err"));
  }, [phase]);

  const start = () => {
    const t = name.trim();
    localStorage.setItem("isl.tester", t);
    meta.current = { tester: t || "anon", lighting: light, distance: dist };
    const keys = pool.map((p) => p.key).sort(() => Math.random() - 0.5);
    setQueue(keys); setIdx(0); setAttempts([]); setSaved("idle"); lock.current = false; setPhase("run");
  };

  const correct = attempts.filter((a) => a.predicted === a.target).length;
  const unc = attempts.filter((a) => a.predicted === null).length;
  const wrong = attempts.length - correct - unc;
  const v = target ? byKey.get(target) : null;
  const g = view?.gate;

  return (
    <div className="page test">
      <header className="page-head"><div><h1>Live test</h1>
        <p className="muted">Show each letter when the app asks for it. It records what the interpreter reads, or that it stayed unsure, and how long it took.</p></div>
        {phase === "run" && <Chip kind="load" pulse>Letter {idx + 1} of {queue.length}</Chip>}</header>

      <div className="test-grid">
        <Stage compact mode="alphabet" onView={onView} onCommit={onCommit} onState={setStage} />
        <div className="card test-panel">
          {phase === "setup" && (<>
            <h2>Start a test</h2>
            <p className="muted">Anyone can run this. Show the letters clearly, one at a time. Every letter is asked once, in random order.</p>
            <label className="field"><span>Your name or code (optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha, or leave blank" maxLength={16} aria-label="Your name or code" />
              {!nameOk && <small className="warn-text">Use letters, digits, - or _ only.</small>}</label>
            <ChoiceRow label="Lighting (optional)" value={light} options={[["bright", "Bright"], ["dim", "Dim"], ["mixed", "Mixed"]]} onChange={setLight} />
            <ChoiceRow label="Distance from camera (optional)" value={dist} options={[["near", "Near"], ["medium", "Medium"], ["far", "Far"]]} onChange={setDist} />
            <button className="btn btn-primary btn-lg" onClick={start} disabled={!ready || !nameOk || !pool.length}>
              <Icon name="target" size={20} /> {ready ? `Start (${pool.length} letters)` : "Waiting for camera and model…"}</button>
          </>)}

          {phase === "run" && v && (<>
            <div className="prompt-sign"><span className="muted">Show this letter</span>
              <b className="big-glyph">{v.short}</b></div>
            <div className="prompt-ring"><Ring value={Math.min(1, elapsed / TIMEOUT_MS)} size={84} stroke={8} kind="primary"><span className="mono">{Math.max(0, Math.ceil((TIMEOUT_MS - elapsed) / 1000))}s</span></Ring>
              <div><div className="conf"><span>Reads as</span><b className="mono">{g?.state === "recognised" && g.label ? byKey.get(g.label)?.short ?? g.label : "…"}</b></div>
                <Bar value={g?.state === "recognised" ? g.holdProgress : 0} kind="ok" label="Hold progress" /></div></div>
            {feedback && <div className={`verdict ${feedback.ok === true ? "ok" : feedback.ok === false ? "bad" : "idle"}`} role="status"><Icon name={feedback.ok ? "check" : feedback.ok === false ? "x" : "info"} size={22} />{feedback.text}</div>}
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => target && advance(measure(viewRef.current?.gate ?? null, null, target))}>Skip</button>
              <button className="btn btn-danger-ghost" onClick={() => setPhase("setup")}>Stop</button></div>
            <p className="small muted">{correct} correct · {wrong} wrong · {unc} unsure so far</p>
          </>)}

          {phase === "done" && (<>
            <h2>Test finished</h2>
            <div className="mini-stats">
              <div><b className="mono">{pct(attempts.length ? correct / attempts.length : 0, 0)}</b><span>correct</span></div>
              <div><b className="mono">{wrong}</b><span>wrong answers shown</span></div>
              <div><b className="mono">{unc}</b><span>stayed unsure</span></div></div>
            <p className="small muted">{saved === "saving" ? "Saving…" : saved === "ok" ? "Saved. See Model & results for the full picture." : saved === "err" ? "Could not save: is the backend running?" : ""}</p>
            <div className="btn-row"><button className="btn btn-primary" onClick={() => setPhase("setup")}>Run another test</button>
              <a className="btn btn-secondary" href="/results" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/results"); window.dispatchEvent(new PopStateEvent("popstate")); }}>See results</a></div>
          </>)}
        </div>
      </div>
    </div>
  );
}

function ChoiceRow<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: [T, string][]; onChange: (v: T | null) => void }) {
  return (
    <div className="field"><span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        <button role="radio" aria-checked={value === null} className={value === null ? "on" : ""} onClick={() => onChange(null)}>Not noted</button>
        {options.map(([v, text]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}
