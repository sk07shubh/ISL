import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, Chip, Icon, Ring, pct } from "../components/ui";
import { Stage, type StageState } from "../components/Stage";
import { Calibrate } from "../components/Calibrate";
import { useSettings } from "../lib/settings";
import { loadVocab } from "../lib/runtime";
import { speak, type LangCode } from "../lib/speech";
import { reasonText } from "../lib/gate";
import type { FrameInfo } from "../lib/engine";
import type { TrackHand, VocabEntry, Vocabulary } from "../lib/types";

const SPACE = " ";

export function Interpreter() {
  const { s, set, setOpen } = useSettings();
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [view, setView] = useState<FrameInfo | null>(null);
  const [stage, setStage] = useState<StageState | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [flash, setFlash] = useState(0);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1600);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const hands = useRef<TrackHand[]>([]);
  const perf = useRef({ n: 0, sum: 0 });

  useEffect(() => { loadVocab().then(setVocab).catch(() => {}); }, []);
  const byKey = useMemo(() => new Map((vocab?.signs ?? []).map((v) => [v.key, v])), [vocab]);
  const nameOf = useCallback((key: string | null | undefined, lang: LangCode = s.lang): string => {
    if (!key) return ""; const v = byKey.get(key); return v ? (v.names[lang] || v.names.en) : key;
  }, [byKey, s.lang]);
  const sentence = tokens.map((k) => (k === SPACE ? SPACE : (byKey.get(k)?.short ?? k) + SPACE)).join("");
  const spoken = tokens.map((k) => (k === SPACE ? SPACE : nameOf(k) + SPACE)).join("");

  const onCommit = useCallback((label: string) => {
    setTokens((t) => [...t, label]); setFlash((n) => n + 1);
    if (s.speakEach) speak(nameOf(label), s.lang, s.voiceURI);
  }, [s.speakEach, s.lang, s.voiceURI, nameOf]);

  const onView = useCallback((f: FrameInfo | null) => {
    setView(f); hands.current = f?.hands ?? [];
    if (f?.hands.length) { perf.current.n++; perf.current.sum += f.ms.total; if (perf.current.n % 30 === 0) try { localStorage.setItem("isl.lastPerf", JSON.stringify({ ms: perf.current.sum / perf.current.n, fps: f.fps, at: Date.now() })); } catch { /* ignore */ } }
  }, []);

  const doSpeak = () => speak(spoken, s.lang, s.voiceURI);
  const doSpace = () => setTokens((t) => (t.length ? [...t, SPACE] : t));
  const doBack = () => setTokens((t) => t.slice(0, -1));
  const doClear = () => setTokens([]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if ((el && (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName) || el.isContentEditable)) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); speak(spoken, s.lang, s.voiceURI); }
      else if (e.key === " ") { e.preventDefault(); doSpace(); }
      else if (e.key === "Backspace") { e.preventDefault(); doBack(); }
      else if (e.key === "Delete") { e.preventDefault(); doClear(); }
      else if (e.key.toLowerCase() === "d") setDev((d) => !d);
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [spoken, s.lang, s.voiceURI]);

  const g = view?.gate ?? null;
  const live = g?.state === "recognised" && g.label ? g.label : null;
  const matched = !!target && live === target;
  const phase = stage?.phase ?? "loading";
  const holdSec = g ? (g.holdProgress * g.holdMs) / 1000 : 0;
  const signs = (vocab?.signs ?? []).filter((v) => v.active);
  const filtered = signs.filter((v) => (v.name + " " + v.short + " " + v.category).toLowerCase().includes(q.toLowerCase()));

  let hint = "Show your hand to the camera";
  if (phase !== "ready") hint = phase === "loading" ? "Getting ready…" : "Fix the message on the video to continue";
  else if (g?.state === "uncertain") hint = reasonText(g.reason);
  else if (g?.state === "recognised") hint = g.locked && g.holdProgress >= 1 ? "Added. Change or lower your hand to sign again" : "Keep holding steady";

  return (
    <div className="page interp">
      {!s.calibrated && phase === "ready" && (
        <div className="banner warn"><Icon name="alert" size={22} />
          <div><b>Feature layout not calibrated.</b> The SignLens model card does not state exactly how its inputs are ordered, so predictions may be wrong until you calibrate once (30 seconds).</div>
          <button className="btn btn-primary" onClick={() => setCalOpen(true)}>Calibrate now</button></div>
      )}
      <div className="toolbar">
        <button className="btn btn-secondary" aria-expanded={railOpen} onClick={() => setRailOpen((o) => !o)}><Icon name="panel" size={18} /> Signs I know <span className="count">{signs.length}</span></button>
        {target && <div className={`practice ${matched ? "ok" : ""}`}><Icon name={matched ? "check" : "target"} size={18} />{matched ? <>Matched <b>{nameOf(target)}</b></> : <>Try to show <b>{nameOf(target)}</b></>}
          <button className="link" onClick={() => setTarget(null)} aria-label="Clear target"><Icon name="x" size={14} /></button></div>}
        <div className="grow" />
        {s.calibrated && <Chip kind="ok">Layout #{s.variant} calibrated</Chip>}
        <button className="btn btn-secondary" onClick={() => setCalOpen(true)}><Icon name="target" size={18} /> Calibrate</button>
        <button className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="settings" size={18} /> Settings</button>
      </div>

      <div className={`interp-grid ${railOpen ? "rail-open" : ""}`}>
        {railOpen && (
          <aside className="card rail" aria-label="Signs I know">
            <header><h2><Icon name="hand" size={22} /> Signs I know</h2>
              <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter, e.g. 5 or T" aria-label="Filter signs" /></label></header>
            <div className="sign-grid">
              {filtered.map((v) => <SignTile key={v.key} v={v} lang={s.lang} live={live === v.key} target={target === v.key} onPick={() => setTarget(target === v.key ? null : v.key)} />)}
              {!filtered.length && <p className="muted">No sign matches “{q}”.</p>}
            </div>
            <footer className="small muted">Tap a tile to practise it. Many ISL signs use both hands, so keep both in view. Reference photos are not bundled yet and the list is not yet checked against the ISLRTC dictionary.</footer>
          </aside>
        )}

        <section className="center">
          <Stage onView={onView} onCommit={onCommit} onState={setStage} overlay={(f) => dev && <DevOverlay f={f} stage={stage} labels={stage?.runtime?.labels ?? []} variant={s.variant} />} />
          <PipelineStrip f={view} stage={stage} words={tokens.filter((t) => t !== SPACE).length} />
        </section>

        <section className="right">
          <div className="card sign-card">
            <header><span className="eyebrow">Recognised sign</span>
              {g?.locked && live && g.holdProgress >= 1 ? <Chip kind="ok">Added</Chip> : live ? <Chip kind="load" pulse>Holding</Chip> : null}</header>
            <div className="sign-main">
              <div className="sign-word" aria-live="polite" aria-atomic="true">
                {live ? <><span className="word">{byKey.get(live)?.short ?? live}</span><span className="native">{nameOf(live)}{s.lang === "en" && byKey.get(live)?.names.hi ? ` · ${byKey.get(live)!.names.hi}` : ""}</span></>
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
            <header><h3>Top 3 predictions</h3><span className="muted small">raw model output</span></header>
            {[0, 1, 2].map((i) => { const t = g?.top[i]; return (
              <div className="t3-row" key={i}><span className="rank mono">{i + 1}</span><span className={`t3-name ${t ? "" : "muted"}`}>{t ? (byKey.get(t.label)?.short ?? t.label) : "—"}</span>
                <span className="t3-bar"><Bar value={t?.prob ?? 0} kind="teal" /></span><span className="mono t3-pct">{t ? pct(t.prob, 1) : ""}</span></div>); })}
          </div>

          <div className="card sentence">
            <header><h3><Icon name="type" size={20} /> Sentence</h3><span className="muted small">{tokens.filter((t) => t !== SPACE).length} signs</span></header>
            <div className="sentence-box" key={flash} data-flash={flash > 0}>
              {sentence ? <span>{sentence}</span> : <span className="muted">Signs you hold steady appear here.</span>}<i className="caret" /></div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={doSpeak} disabled={!sentence.trim()}><Icon name="speaker" size={18} /> Speak <kbd>Enter</kbd></button>
              <button className="btn btn-secondary" onClick={doSpace}><Icon name="space" size={18} /> Space <kbd>␣</kbd></button>
              <button className="btn btn-secondary" onClick={doBack} disabled={!tokens.length}><Icon name="backspace" size={18} /> Back <kbd>⌫</kbd></button>
              <button className="btn btn-danger" onClick={doClear} disabled={!tokens.length}><Icon name="trash" size={18} /> Clear <kbd>Del</kbd></button>
            </div>
          </div>
        </section>
      </div>

      {calOpen && stage?.runtime && vocab && (
        <Calibrate model={stage.runtime.model} signs={signs} getHands={() => hands.current} current={s.variant}
          onApply={(id) => set({ variant: id, calibrated: true })} onClose={() => setCalOpen(false)} />
      )}
    </div>
  );
}

function SignTile({ v, lang, live, target, onPick }: { v: VocabEntry; lang: LangCode; live: boolean; target: boolean; onPick: () => void }) {
  return (
    <button className={`tile ${live ? "live" : ""} ${target ? "target" : ""}`} onClick={onPick} aria-pressed={target} title={v.note || undefined}>
      {v.image ? <img src={v.image} alt="" loading="lazy" /> : <span className="glyph" aria-hidden="true">{v.short}</span>}
      <b>{v.names[lang] || v.names.en}</b>
      <small>{v.names.hi && lang === "en" ? v.names.hi : v.category}</small>
      {v.note && <i className="flag" aria-label={v.note} />}
    </button>
  );
}

function PipelineStrip({ f, stage, words }: { f: FrameInfo | null; stage: StageState | null; words: number }) {
  const ready = stage?.phase === "ready", g = f?.gate;
  const short = (r?: string) => ({ low_prob: "Low confidence", low_margin: "Close call", unstable: "Settling", rejected: "Rejected" } as Record<string, string>)[r ?? ""] ?? "Uncertain";
  const tiles = [
    { icon: "camera", name: "Tracker", val: ready ? `${f ? f.ms.track.toFixed(1) : "–"} ms` : "—", sub: stage?.delegate ? `${stage.delegate} · up to 2 hands` : "up to 2 hands" },
    { icon: "layers", name: "Features", val: f?.feats ? "156 values" : "—", sub: f?.feats ? `${f.ms.feat.toFixed(2)} ms` : "needs a hand" },
    { icon: "cpu", name: "SignLens", val: f?.probs ? `${f.ms.model.toFixed(2)} ms` : "—", sub: "MLP 512-256-128" },
    { icon: "lock", name: "Gate", val: !ready ? "—" : g?.state === "recognised" ? "Passed" : g?.state === "uncertain" ? short(g.reason) : "No hand", sub: g ? `top ${pct(g.confidence, 0)}` : "confidence rules" },
    { icon: "type", name: "Text", val: `${words} sign${words === 1 ? "" : "s"}`, sub: "sentence buffer" },
  ];
  return (
    <div className="pipeline" aria-label="Pipeline status">
      {tiles.map((t, i) => (<div className="p-tile" key={t.name}><span className="p-name"><Icon name={t.icon} size={16} />{t.name}</span><b className="mono">{t.val}</b><small className="mono">{t.sub}</small>{i < tiles.length - 1 && <i className="p-arrow" aria-hidden="true" />}</div>))}
      <p className="p-foot small muted">Everything runs in this browser and no video leaves the laptop. Press <kbd>D</kbd> for the developer overlay.</p>
    </div>
  );
}

function DevOverlay({ f, stage, labels, variant }: { f: FrameInfo | null; stage: StageState | null; labels: string[]; variant: number }) {
  const cfg = stage?.runtime?.cfg;
  const probs = f?.probs ? Array.from(f.probs).map((p, i) => ({ l: labels[i], p })).sort((a, b) => b.p - a.p).slice(0, 6) : [];
  return (
    <div className="dev mono" aria-label="Developer overlay">
      <b>dev</b> frame {f ? f.ms.total.toFixed(1) : "–"} ms · layout #{variant} · scaler {stage?.runtime?.model.hasScaler ? "yes" : "no"}
      {cfg && <div>gate p≥{cfg.min_prob} margin≥{cfg.min_margin} win {cfg.smoothing_window} hold {cfg.hold_ms}ms</div>}
      {probs.map((x) => <div key={x.l}>{x.l.padEnd(3)} {(x.p * 100).toFixed(1).padStart(5)}%</div>)}
      {f?.gate && <div>{f.gate.state}{f.gate.reason ? ` (${f.gate.reason})` : ""} · hold {(f.gate.holdProgress * 100).toFixed(0)}%</div>}
    </div>
  );
}
