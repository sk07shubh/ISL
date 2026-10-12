import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, Chip, Icon, Ring, pct } from "../components/ui";
import { Stage, type StageState } from "../components/Stage";
import { loadVocab } from "../lib/runtime";
import { saveTest, type Attempt } from "../lib/api";
import type { FrameInfo } from "../lib/engine";
import type { GateOutput, Vocabulary } from "../lib/types";

const TIMEOUT_MS = 8000;
type Scope = "all" | "Numerals" | "Alphabet";
type Phase = "setup" | "run" | "done";

/** A guided accuracy test: show each sign in turn; the app records what it commits (or that it stayed Uncertain).
 *  This is how we measure accuracy ourselves, including on a stranger (plan: "live stranger test"). */
export function Test() {
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [view, setView] = useState<FrameInfo | null>(null);
  const [tester, setTester] = useState(() => localStorage.getItem("isl.tester") || "");
  const [scope, setScope] = useState<Scope>("all");
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean | null; text: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const startedAt = useRef(0), lock = useRef(false);
  const cur = useRef({ phase, queue, idx }); cur.current = { phase, queue, idx };

  useEffect(() => { loadVocab().then(setVocab).catch(() => {}); }, []);
  const byKey = useMemo(() => new Map((vocab?.signs ?? []).map((v) => [v.key, v])), [vocab]);
  const pool = (vocab?.signs ?? []).filter((v) => v.active && (scope === "all" || v.category === scope));
  const target = phase === "run" ? queue[idx] : null;

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

  const onCommit = useCallback((label: string, g: GateOutput) => {
    const c = cur.current; if (c.phase !== "run" || lock.current) return;
    advance({ target: c.queue[c.idx], predicted: label, confidence: g.confidence, margin: g.margin });
  }, [advance]);

  useEffect(() => {   // timeout per sign
    if (phase !== "run") return;
    startedAt.current = performance.now();
    const iv = setInterval(() => {
      const e = performance.now() - startedAt.current; setElapsed(e);
      const c = cur.current; if (c.phase === "run" && e > TIMEOUT_MS && !lock.current) advance({ target: c.queue[c.idx], predicted: null, confidence: null, margin: null });
    }, 100);
    return () => clearInterval(iv);
  }, [phase, advance]);

  useEffect(() => {   // save when finished
    if (phase !== "done" || !attempts.length) return;
    setSaved("saving"); saveTest(tester.trim() || "anon", attempts).then(() => setSaved("ok")).catch(() => setSaved("err"));
  }, [phase]);

  const start = () => {
    const t = tester.trim(); if (t && !/^[A-Za-z0-9_-]{1,16}$/.test(t)) return;
    localStorage.setItem("isl.tester", t);
    const keys = pool.map((p) => p.key).sort(() => Math.random() - 0.5);
    setQueue(keys); setIdx(0); setAttempts([]); setSaved("idle"); lock.current = false; setPhase("run");
  };

  const correct = attempts.filter((a) => a.predicted === a.target).length;
  const unc = attempts.filter((a) => a.predicted === null).length;
  const wrong = attempts.length - correct - unc;
  const v = target ? byKey.get(target) : null;
  const g = view?.gate;
  const ready = stage?.phase === "ready";

  return (
    <div className="page test">
      <header className="page-head"><div><h1>Live test</h1>
        <p className="muted">Show each sign when asked. The app records what it reads, or that it stayed Uncertain. Results appear on the Results screen.</p></div>
        {phase === "run" && <Chip kind="load" pulse>Sign {idx + 1} of {queue.length}</Chip>}</header>

      <div className="test-grid">
        <Stage compact onView={setView} onCommit={onCommit} onState={setStage} />
        <div className="card test-panel">
          {phase === "setup" && (<>
            <h2>Start a test</h2>
            <label className="field"><span>Tester code (anonymous)</span>
              <input className="mono" value={tester} onChange={(e) => setTester(e.target.value)} placeholder="T01, or leave blank" maxLength={16} aria-label="Tester code" /></label>
            <div className="field"><span>Signs to test</span>
              <div className="segmented" role="radiogroup" aria-label="Scope">{(["all", "Numerals", "Alphabet"] as Scope[]).map((s) => <button key={s} role="radio" aria-checked={scope === s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>{s === "all" ? `All (${vocab?.signs.length ?? 35})` : s}</button>)}</div></div>
            <p className="muted small">For the strongest evidence, have someone who never calibrated or practised the app do the test. Use a code like T01 rather than a name.</p>
            <button className="btn btn-primary btn-lg" onClick={start} disabled={!ready || !pool.length}><Icon name="target" size={20} /> {ready ? `Start (${pool.length} signs)` : "Waiting for camera and model…"}</button>
          </>)}

          {phase === "run" && v && (<>
            <div className="prompt-sign"><span className="muted">Show this sign</span>
              <b className="big-glyph">{v.short}</b><span className="native">{v.name}{v.names.hi ? ` · ${v.names.hi}` : ""}</span></div>
            <div className="prompt-ring"><Ring value={Math.min(1, elapsed / TIMEOUT_MS)} size={84} stroke={8} kind="primary"><span className="mono">{Math.max(0, Math.ceil((TIMEOUT_MS - elapsed) / 1000))}s</span></Ring>
              <div><div className="conf"><span>Reads as</span><b className="mono">{g?.state === "recognised" && g.label ? byKey.get(g.label)?.short ?? g.label : "…"}</b></div>
                <Bar value={g?.state === "recognised" ? g.holdProgress : 0} kind="ok" label="Hold progress" /></div></div>
            {feedback && <div className={`verdict ${feedback.ok === true ? "ok" : feedback.ok === false ? "bad" : "idle"}`} role="status"><Icon name={feedback.ok ? "check" : feedback.ok === false ? "x" : "info"} size={22} />{feedback.text}</div>}
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => target && advance({ target, predicted: null, confidence: null, margin: null })}>Skip</button>
              <button className="btn btn-danger-ghost" onClick={() => setPhase("setup")}>Stop</button></div>
            <p className="small muted">{correct} correct · {wrong} wrong · {unc} uncertain so far</p>
          </>)}

          {phase === "done" && (<>
            <h2>Test finished</h2>
            <div className="mini-stats">
              <div><b className="mono">{pct(attempts.length ? correct / attempts.length : 0, 0)}</b><span>correct</span></div>
              <div><b className="mono">{wrong}</b><span>wrong answers shown</span></div>
              <div><b className="mono">{unc}</b><span>stayed uncertain</span></div></div>
            <p className="small muted">{saved === "saving" ? "Saving…" : saved === "ok" ? "Saved to the Results screen." : saved === "err" ? "Could not save: is the backend running?" : ""}</p>
            <div className="btn-row"><button className="btn btn-primary" onClick={() => setPhase("setup")}>Run another test</button>
              <a className="btn btn-secondary" href="/results" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/results"); window.dispatchEvent(new PopStateEvent("popstate")); }}>See results</a></div>
          </>)}
        </div>
      </div>
    </div>
  );
}
