import { useEffect, useRef, useState } from "react";
import { Bar, Icon, pct } from "./ui";
import { buildFeatures, describeVariant, VARIANTS, type SignLensModel } from "../lib/signlens";
import type { TrackHand, VocabEntry } from "../lib/types";

/** The model card does not publish the exact 156-value layout, so we let the model itself tell us: show a sign you know,
 *  and every candidate layout is scored by how strongly the model recognises that sign. */
export function Calibrate({ model, signs, getHands, current, onApply, onClose }: {
  model: SignLensModel; signs: VocabEntry[]; getHands: () => TrackHand[]; current: number; onApply: (id: number) => void; onClose: () => void;
}) {
  const [target, setTarget] = useState(signs.find((s) => s.key === "5")?.key ?? signs[0]?.key ?? "");
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const [n, setN] = useState(0);
  const acc = useRef<{ sum: number[]; hit: number[]; n: number }>({ sum: [], hit: [], n: 0 });
  const [rank, setRank] = useState<{ id: number; score: number; acc: number }[]>([]);
  const NEED = 40;

  useEffect(() => {
    if (phase !== "run") return;
    const idx = model.classes.indexOf(target);
    const iv = setInterval(() => {
      const hands = getHands(); if (!hands.length) return;
      const a = acc.current;
      VARIANTS.forEach((v) => { const f = buildFeatures(hands, v); if (!f) return; const p = model.predict(f); a.sum[v.id] = (a.sum[v.id] ?? 0) + p[idx]; let best = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i; a.hit[v.id] = (a.hit[v.id] ?? 0) + (best === idx ? 1 : 0); });
      a.n++; setN(a.n);
      if (a.n >= NEED) {
        clearInterval(iv);
        setRank(VARIANTS.map((v) => ({ id: v.id, score: (a.sum[v.id] ?? 0) / a.n, acc: (a.hit[v.id] ?? 0) / a.n })).sort((x, y) => y.score - x.score));
        setPhase("done");
      }
    }, 70);
    return () => clearInterval(iv);
  }, [phase]);

  const start = () => { acc.current = { sum: [], hit: [], n: 0 }; setN(0); setPhase("run"); };
  const best = rank[0];
  return (
    <div className="drawer-wrap"><div className="scrim" onClick={onClose} />
      <section className="modal card" role="dialog" aria-modal="true" aria-label="Calibrate feature layout">
        <header><h2>Calibrate feature layout</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></header>
        <p className="muted">SignLens does not publish exactly how its 156 inputs are ordered, so this app tries {VARIANTS.length} layouts and keeps the one the model recognises best. Pick a sign you can perform correctly, show it to the camera (both hands if it uses both), and hold it steady.</p>
        <label className="field"><span>The sign I will show</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={phase === "run"}>{signs.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
        {phase !== "done" && <>
          <Bar value={n / NEED} kind="primary" label="Calibration progress" />
          <button className="btn btn-primary" onClick={start} disabled={phase === "run"}>{phase === "run" ? `Hold steady… ${n}/${NEED} frames` : "Start (3 seconds)"}</button></>}
        {phase === "done" && best && <>
          <div className={`banner ${best.score > 0.6 ? "ok" : "warn"}`}><Icon name={best.score > 0.6 ? "check" : "alert"} size={22} />
            <div>{best.score > 0.6 ? <><b>Layout found.</b> The model gives {pct(best.score, 0)} confidence to the sign you showed under this layout.</> : <><b>No layout matched strongly.</b> Best was {pct(best.score, 0)}. Check the sign is performed as in the dataset, both hands are in view, then try another sign.</>}</div></div>
          <ol className="rank">{rank.slice(0, 4).map((r, i) => (
            <li key={r.id} className={i === 0 ? "top" : ""}><span className="mono">#{r.id}</span><span>{describeVariant(VARIANTS[r.id])}</span><b className="mono">{pct(r.score, 0)}</b></li>))}</ol>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { onApply(best.id); onClose(); }} disabled={best.score < 0.2}>Use layout #{best.id}</button>
            <button className="btn btn-secondary" onClick={start}>Try again</button>
            {current !== 0 && <button className="btn btn-secondary" onClick={() => { onApply(0); onClose(); }}>Reset to default</button>}</div></>}
      </section></div>
  );
}
