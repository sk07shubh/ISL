import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bar, Chip, Icon, Ring, pct } from "../components/ui";
import { MODE_NAME, Stage, type StageState } from "../components/Stage";
import { useSettings } from "../lib/settings";
import { loadVocab, loadModel } from "../lib/runtime";
import { speak } from "../lib/speech";
import { speakableSentence, spellSign, insertAt, deleteBefore, wordCount } from "../lib/sentence";
import { reasonText } from "../lib/gate";
import type { Mode } from "../lib/api";
import type { FrameInfo } from "../lib/engine";
import type { ModelInfo, VocabEntry } from "../lib/types";


export function Interpreter() {
  const { s, setOpen } = useSettings();
  const [mode, setMode] = useState<Mode>("all");
  const [signs, setSigns] = useState<VocabEntry[]>([]);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [view, setView] = useState<FrameInfo | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [text, setTextState] = useState("");
  const textRef = useRef("");
  const caretRef = useRef<number | null>(null);          // null = end of text
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1600);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const perf = useRef({ n: 0, sum: 0 });
  const settingsRef = useRef(s); settingsRef.current = s;

  useEffect(() => { loadModel().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { loadVocab().then((v) => setSigns(v.signs)).catch(() => setSigns([])); }, []);
  useEffect(() => { setView(null); }, [mode]);
  const byKey = useMemo(() => new Map(signs.map((v) => [v.key, v])), [signs]);

  // ---- the sentence editor: one text box, edited like any normal text editor
  const setText = useCallback((next: string, caret: number | null) => {
    textRef.current = next; caretRef.current = caret; setTextState(next);
  }, []);
  const applyEdit = useCallback((e: { text: string; caret: number }) => setText(e.text, e.caret), [setText]);
  useLayoutEffect(() => {                                  // keep the caret where the edit put it
    const ta = taRef.current;
    if (ta && caretRef.current !== null && document.activeElement === ta) ta.setSelectionRange(caretRef.current, caretRef.current);
  }, [text]);

  const insert = useCallback((ins: string) => {
    applyEdit(insertAt(textRef.current, caretRef.current, ins));
  }, [applyEdit]);
  const doSpace = () => insert(" ");
  const doBack = () => applyEdit(deleteBefore(textRef.current, caretRef.current));
  const doClear = () => setText("", 0);
  const doSpeak = () => speak(speakableSentence(textRef.current), "en", s.voiceURI);

  // ---- real-time: a recognised sign goes into the editor and is spelled out at once
  const onCommit = useCallback((label: string) => {
    const entry = byKey.get(label);
    const kind = entry?.kind ?? "letter";
    const shown = kind === "word" ? (entry?.speak || entry?.short || label) : (entry?.short ?? label);
    const sett = settingsRef.current;
    const addSpace = kind === "word" || sett.autoSpace;
    insert(addSpace ? shown + " " : shown);
    if (sett.speakEach) speak(spellSign({ key: label, kind, speak: entry?.speak ?? undefined }), "en", sett.voiceURI);   // once, this sign only
  }, [byKey, mode, insert]);

  const onView = useCallback((f: FrameInfo | null) => {
    setView(f);
    if (f?.hands.length) {
      perf.current.n++; perf.current.sum += f.ms.total + f.ms.server;
      if (perf.current.n % 30 === 0) try { localStorage.setItem("isl.lastPerf", JSON.stringify({ ms: perf.current.sum / perf.current.n, fps: f.fps, at: Date.now() })); } catch { /* ignore */ }
    }
  }, []);

  // keyboard: when the editor is not focused, Enter / Space / Backspace / Delete act on the sentence
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if ((el && (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName) || el.isContentEditable)) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); doSpeak(); }
      else if (e.key === " ") { e.preventDefault(); doSpace(); }
      else if (e.key === "Backspace") { e.preventDefault(); doBack(); }
      else if (e.key.toLowerCase() === "d" && !e.shiftKey) setDev((d) => !d);
      else if (e.key.length === 1) e.preventDefault();          // no typing letters or digits: only recognition adds signs
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const g = view?.gate ?? null;
  const live = g?.state === "recognised" && g.label ? g.label : null;
  const matched = !!target && live === target;
  const phase = stage?.phase ?? "loading";
  const holdSec = g ? (g.holdProgress * g.holdMs) / 1000 : 0;
  const inMode = signs.filter((v) => mode === "all" || v.kind === (mode === "alphabet" ? "letter" : mode === "digit" ? "digit" : "word"));
  const filtered = inMode.filter((v) => (v.name + " " + v.short + " " + v.category).toLowerCase().includes(q.toLowerCase()));
  const words = wordCount(text);

  let hint = "Show your hand to the camera";
  if (phase !== "ready") hint = phase === "loading" ? "Getting ready…" : "Fix the message on the video to continue";
  else if (g?.state === "uncertain") hint = reasonText(g.reason);
  else if (g?.state === "recognised") hint = g.locked && g.holdProgress >= 1 ? "Added. Change or lower your hand to sign again" : "Keep holding steady";

  return (
    <div className="page interp">
      <div className="toolbar">
        <button className="btn btn-secondary" aria-expanded={railOpen} onClick={() => setRailOpen((o) => !o)}><Icon name="panel" size={18} /> Signs I know <span className="count">{inMode.length}</span></button>
        <div className="segmented sm mode-toggle" role="radiogroup" aria-label="What to recognise">
          {([["all", "All"], ["alphabet", "Letters"], ["digit", "Digits"], ["phrase", "Phrases"]] as [Mode, string][]).map(([m, t]) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{t}</button>))}
        </div>
        {target && <div className={`practice ${matched ? "ok" : ""}`}><Icon name={matched ? "check" : "target"} size={18} />{matched ? <>Matched <b>{byKey.get(target)?.name}</b></> : <>Try to show <b>{byKey.get(target)?.name}</b></>}
          <button className="link" onClick={() => setTarget(null)} aria-label="Clear target"><Icon name="x" size={14} /></button></div>}
        <div className="grow" />
        {info && (info.parity.ok ? <Chip kind="ok">Matches training code</Chip> : <Chip kind="err">Parity check failed</Chip>)}
        <button className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="settings" size={18} /> Settings</button>
      </div>

      <div className={`interp-grid ${railOpen ? "rail-open" : ""}`}>
        {railOpen && (
          <aside className="card rail" aria-label="Signs I know">
            <header><h2><Icon name="hand" size={22} /> Signs I know</h2>
              <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter, e.g. A or 5" aria-label="Filter signs" /></label></header>
            <div className="sign-grid">
              {filtered.map((v) => <SignTile key={v.key} v={v} live={live === v.key} target={target === v.key} onPick={() => setTarget(target === v.key ? null : v.key)} />)}
              {!filtered.length && <p className="muted">No sign matches “{q}”.</p>}
            </div>
            <footer className="small muted">Tap a tile to practise it. Hold a sign steady for about half a second to add it to the sentence.</footer>
          </aside>
        )}

        <section className="center">
          <Stage mode={mode} onView={onView} onCommit={onCommit} onState={setStage}
            overlay={(f) => dev && <DevOverlay f={f} info={info} mode={mode} />} />
          <PipelineStrip f={view} info={info} mode={mode} words={words} />
        </section>

        <section className="right">
          <div className="card sign-card">
            <header><span className="eyebrow">Recognised sign</span>
              {g?.locked && live && g.holdProgress >= 1 ? <Chip kind="ok">Added</Chip> : live ? <Chip kind="load" pulse>Holding</Chip> : null}</header>
            <div className="sign-main">
              <div className="sign-word" aria-live="polite" aria-atomic="true">
                {live ? <span className="word">{byKey.get(live)?.short ?? live}</span>
                  : <span className="word placeholder">{g?.state === "uncertain" ? "Uncertain" : phase === "ready" ? "No hand" : "—"}</span>}
              </div>
              <Ring value={live ? g!.holdProgress : 0} kind={g?.locked && live ? "ok" : "primary"}>
                <span className="ring-num mono">{live ? holdSec.toFixed(1) : "0.0"}s</span><span className="ring-sub">of {g ? (g.holdMs / 1000).toFixed(1) : "0.6"}s</span></Ring>
            </div>
            <div className="conf"><span>Confidence</span><b className="mono">{live ? pct(g!.confidence, 1) : "—"}</b></div>
            <Bar value={live ? g!.confidence : 0} kind={live ? "ok" : "primary"} label="Model confidence" />
            <p className={`hint ${g?.state === "uncertain" ? "warn" : ""}`}>{hint}</p>
          </div>

          <div className="card top3">
            <header><h3>Top 3 predictions</h3><span className="muted small">averaged over {info?.gate.smooth ?? 8} frames</span></header>
            {[0, 1, 2].map((i) => { const t = g?.top[i]; return (
              <div className="t3-row" key={i}><span className="rank mono">{i + 1}</span><span className={`t3-name ${t ? "" : "muted"}`}>{t ? (byKey.get(t.label)?.short ?? t.label) : "—"}</span>
                <span className="t3-bar"><Bar value={t?.prob ?? 0} kind="teal" /></span><span className="mono t3-pct">{t ? pct(t.prob, 1) : ""}</span></div>); })}
          </div>

          <div className="card sentence">
            <header><h3><Icon name="type" size={20} /> Sentence</h3><span className="muted small">{words} {words === 1 ? "word" : "words"}</span></header>
            <textarea
              ref={taRef} className="sentence-input" readOnly tabIndex={-1}
              value={text} rows={3} spellCheck={false}
              aria-label="Sentence. Filled in by hand recognition. Space adds a space and Backspace deletes."
              placeholder="Signs you hold steady appear here. Space adds a space, Backspace deletes."
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSpeak(); } }}
            />
            <div className="btn-row">
              <button className="btn btn-primary" onClick={doSpeak} disabled={!text.trim()} title="Speak the sentence, word by word"><Icon name="speaker" size={18} /> Speak <kbd>Enter</kbd></button>
              <button className="btn btn-secondary" onClick={doSpace}><Icon name="space" size={18} /> Space <kbd>␣</kbd></button>
              <button className="btn btn-secondary" onClick={doBack} disabled={!text.length}><Icon name="backspace" size={18} /> Delete <kbd>⌫</kbd></button>
              <button className="btn btn-danger" onClick={doClear} disabled={!text.length}><Icon name="trash" size={18} /> Clear</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function signImagePath(v: VocabEntry) {
  const category = v.kind === "letter" ? "letters" : v.kind === "digit" ? "digits" : "phrases";
  const label = v.kind === "word" ? v.key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : v.short.toUpperCase();
  return `/isl-sign-illustrations/${category}/${label}.png`;
}

function SignTile({ v, live, target, onPick }: { v: VocabEntry; live: boolean; target: boolean; onPick: () => void }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const palette = v.kind === "letter"
    ? { bg: "linear-gradient(145deg,#eef8ff 0%,#dceeff 100%)", ink: "#234f88", accent: "#8bc8ff" }
    : v.kind === "digit"
      ? { bg: "linear-gradient(145deg,#effaf2 0%,#dcf4e4 100%)", ink: "#216a4d", accent: "#8bd4ae" }
      : { bg: "linear-gradient(145deg,#f7f1ff 0%,#e9e0ff 100%)", ink: "#5d438f", accent: "#c4a9ff" };
  return (
    <button
      className={`tile ${live ? "live" : ""} ${target ? "target" : ""}`}
      onClick={onPick}
      aria-pressed={target}
      style={{
        background: palette.bg,
        border: target ? "2px solid #7862d8" : live ? "2px solid #28a879" : "1px solid rgba(111,143,178,.15)",
        borderRadius: 16,
        boxShadow: live ? "0 0 0 3px rgba(40,168,121,.12),0 5px 14px rgba(36,72,112,.08)" : "0 4px 12px rgba(36,72,112,.06)",
        padding: "10px 8px 10px",
        minHeight: 116,
        color: palette.ink,
        transition: "box-shadow .18s ease,border-color .18s ease,transform .18s ease"
      }}
    >
      <span aria-hidden="true" style={{
        position: "relative", display: "block", width: "100%", height: 86,
        flexShrink: 0, margin: "0 auto 8px", borderRadius: 12, overflow: "hidden",
        background: "rgba(255,255,255,.38)",
        border: `1px solid ${palette.accent}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.9)"
      }}>
        <img
          src={signImagePath(v)}
          alt=""
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(false)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", padding: 2, boxSizing: "border-box" }}
        />
        {!imageLoaded && <span className={`glyph ${v.kind === "word" ? "wordy" : ""}`} style={{
          position: "absolute", inset: 0, margin: 0, width: "100%", height: "100%",
          boxSizing: "border-box", borderRadius: 0, background: "transparent",
          color: palette.ink, fontSize: v.kind === "word" ? 17 : 29,
          fontWeight: 750, lineHeight: 1.05, letterSpacing: v.kind === "word" ? "-.4px" : "-1px"
        }}>{v.short}</span>}
      </span>
      <b style={{ display: "block", color: palette.ink, fontSize: 13, lineHeight: 1.25 }}>{v.name}</b>
      <small style={{ display: "block", color: palette.ink, opacity: .7, fontSize: 10, marginTop: 4 }}>{v.category}</small>
    </button>
  );
}
function PipelineStrip({ f, info, mode, words }: { f: FrameInfo | null; info: ModelInfo | null; mode: Mode; words: number }) {
  const g = f?.gate;
  const short = (r?: string) => ({ low_prob: "Below threshold", low_margin: "Close call", unstable: "Settling", rejected: "Filling window" } as Record<string, string>)[r ?? ""] ?? "Uncertain";
  const n = info ? Object.keys(info.heads).length : 0;
  const tiles = [
    { icon: "camera", name: "Tracker", val: f ? `${f.ms.track.toFixed(1)} ms` : "—", sub: "MediaPipe · in browser" },
    { icon: "cpu", name: "Classifiers", val: f?.hands.length ? `${f.ms.server.toFixed(0)} ms` : "—", sub: `${n || 3} models · backend` },
    { icon: "layers", name: "Signs", val: info ? `${info.labels.length}` : "—", sub: `${MODE_NAME[mode]}` },
    { icon: "lock", name: "Gate", val: !g ? "—" : g.state === "recognised" ? "Passed" : g.state === "uncertain" ? short(g.reason) : "No hand", sub: `threshold ${info?.gate.threshold ?? 0.8} · stable ${info?.gate.stable ?? 5}` },
    { icon: "type", name: "Text", val: `${words} item${words === 1 ? "" : "s"}`, sub: "sentence" },
  ];
  return (
    <div className="pipeline" aria-label="Pipeline status">
      {tiles.map((t, i) => (<div className="p-tile" key={t.name}><span className="p-name"><Icon name={t.icon} size={16} />{t.name}</span><b className="mono">{t.val}</b><small className="mono">{t.sub}</small>{i < tiles.length - 1 && <i className="p-arrow" aria-hidden="true" />}</div>))}
      <p className="p-foot small muted">Hand tracking runs in this browser. Only hand points are sent to the classifiers on this laptop. Press <kbd>D</kbd> for the developer overlay.</p>
    </div>
  );
}

function DevOverlay({ f, info, mode }: { f: FrameInfo | null; info: ModelInfo | null; mode: Mode }) {
  const labels = info?.labels ?? [];
  const probs = f?.probs ? f.probs.map((p, i) => ({ l: labels[i], p })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 6) : [];
  return (
    <div className="dev mono" aria-label="Developer overlay">
      <b>dev</b> server {f ? f.ms.server.toFixed(1) : "–"} ms · window {f?.buffered ?? 0}/{info?.gate.smooth ?? 8}
      {probs.map((x) => <div key={x.l}>{String(x.l).padEnd(10)} {(x.p * 100).toFixed(1).padStart(5)}%</div>)}
      {f?.gate && <div>{f.gate.state}{f.gate.reason ? ` (${f.gate.reason})` : ""} · hold {(f.gate.holdProgress * 100).toFixed(0)}%</div>}
    </div>
  );
}
