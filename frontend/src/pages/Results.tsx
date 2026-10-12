import { useEffect, useMemo, useState } from "react";
import { Bar, Chip, Icon, pct } from "../components/ui";
import { getJson, liveTests, deleteTester, type LiveData } from "../lib/api";
import { loadVocab } from "../lib/runtime";
import type { ConfigFile, Vocabulary } from "../lib/types";
import { AppError } from "../lib/types";

interface Card {
  source: string; license: string; author: string; note: string;
  model: { name: string; architecture: string; input_dim: number; classes: number; train_samples: number };
  summary: { accuracy: number; macro_f1: number; weighted_f1: number; n_test: number; realistic_low: number; realistic_high: number };
  per_class: { key: string; precision: number; recall: number; f1: number; support: number }[];
}

export function Results() {
  const [card, setCard] = useState<Card | null>(null);
  const [cfg, setCfg] = useState<ConfigFile | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [tries, setTries] = useState(0);
  const [hasPng, setHasPng] = useState(false);

  useEffect(() => {
    setErr(null);
    getJson<Card>("/model/model_card.json", "model/model_card.json").then(setCard).catch(setErr);
    getJson<ConfigFile>("/model/config.json", "model/config.json").then(setCfg).catch(() => {});
    liveTests().then(setLive).catch(() => setLive({ tests: [], attempts: [] }));
    loadVocab().then(setVocab).catch(() => {});
    fetch("/model/confusion_matrix_isl.png", { method: "HEAD" }).then((r) => setHasPng(r.ok && !(r.headers.get("content-type") || "").includes("html"))).catch(() => {});
  }, [tries]);

  const A = live?.attempts ?? [];
  const m = useMemo(() => {
    const n = A.length, correct = A.filter((a) => a.predicted === a.target).length, unc = A.filter((a) => a.predicted === null).length;
    const shown = n - unc, wrong = shown - correct;
    const per = new Map<string, { n: number; ok: number; unc: number }>();
    for (const a of A) { const r = per.get(a.target) ?? { n: 0, ok: 0, unc: 0 }; r.n++; if (a.predicted === a.target) r.ok++; if (a.predicted === null) r.unc++; per.set(a.target, r); }
    const curve = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98].map((t) => { const sh = A.filter((a) => a.predicted !== null && (a.confidence ?? 0) >= t); return { t, acc: sh.length ? sh.filter((a) => a.predicted === a.target).length / sh.length : null, cov: n ? sh.length / n : 0 }; });
    return { n, correct, unc, shown, wrong, per, curve, testers: new Set(A.map((a) => a.tester)).size };
  }, [A]);

  if (err) return <div className="page"><div className="card state-card error" role="alert"><Icon name="alert" size={40} /><h2>Model details are not available</h2><p>{err.message}</p><code className="file">{err.file}</code>
    <button className="btn btn-secondary" onClick={() => setTries((n) => n + 1)}><Icon name="refresh" size={18} /> Check again</button></div></div>;
  if (!card) return <div className="page"><div className="card state-card"><div className="spinner" /><p>Loading…</p></div></div>;

  const names = new Map((vocab?.signs ?? []).map((v) => [v.key, v]));
  let perf: { ms: number; fps: number } | null = null; try { perf = JSON.parse(localStorage.getItem("isl.lastPerf") || "null"); } catch { /* ignore */ }
  const S = card.summary;

  return (
    <div className="page results">
      <header className="page-head"><div><h1>Model &amp; results</h1>
        <p className="muted">Two kinds of numbers, kept apart on purpose: what the model’s author published, and what we measured ourselves with the Live test.</p></div>
        <div className="btn-row"><a className="btn btn-secondary" href="/test" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/test"); window.dispatchEvent(new PopStateEvent("popstate")); }}><Icon name="target" size={18} /> Run a live test</a>
          <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={18} /> Print / PDF</button></div></header>

      <section className="stats">
        <div className="card stat"><span className="stat-label">Our measured accuracy</span>
          <b className="stat-num">{m.n ? (m.correct / m.n * 100).toFixed(1) : "—"}{m.n ? <small>%</small> : null}</b>
          <span className="muted">{m.n ? `${m.correct} of ${m.n} attempts correct, ${m.testers} tester${m.testers === 1 ? "" : "s"}` : "No live tests yet"}</span>
          <span className="stat-foot">{m.n ? <>Wrong answers shown <b className="mono">{m.wrong}</b> · stayed uncertain <b className="mono">{m.unc}</b></> : "Run a live test to fill this in"}</span></div>
        <div className="card stat"><span className="stat-label">Coverage</span>
          <b className="stat-num">{m.n ? (m.shown / m.n * 100).toFixed(1) : "—"}{m.n ? <small>%</small> : null}</b>
          <span className="muted">of attempts passed the confidence gate</span>
          <span className="stat-foot">{m.shown ? <>Accuracy when shown <b className="mono">{pct(m.correct / m.shown)}</b></> : "Gate: p ≥ " + (cfg?.min_prob ?? 0.85) + ", margin ≥ " + (cfg?.min_margin ?? 0.3)}</span></div>
        <div className="card stat"><span className="stat-label">Avg inference time</span>
          <b className="stat-num">{perf ? perf.ms.toFixed(1) : "—"}{perf ? <small> ms</small> : null}</b>
          <span className="muted">{perf ? "whole pipeline per frame, this browser" : "Open the Interpreter once to measure"}</span>
          <span className="stat-foot">{perf ? <>Last live run <b className="mono">{perf.fps.toFixed(0)} fps</b>. Target 20+</> : "Author claims 60+ fps"}</span></div>
        <div className="card stat"><span className="stat-label">Signs supported</span>
          <b className="stat-num">{card.model.classes}</b><span className="muted">numerals 1–9 and letters A–Z, one or two hands</span>
          <span className="stat-foot">{vocab ? vocab.signs.filter((s) => s.verified).length : 0} verified against ISLRTC</span></div>
      </section>

      <section className="card published">
        <header className="card-head"><div><h2>Published by the model author</h2><p className="muted">{card.note}</p></div><Chip kind="warn">Self-reported</Chip></header>
        <div className="mini-stats wide">
          <div><b className="mono">{pct(S.accuracy, 2)}</b><span>held-out accuracy ({S.n_test.toLocaleString()} frames)</span></div>
          <div><b className="mono">{pct(S.weighted_f1, 1)}</b><span>weighted F1</span></div>
          <div><b className="mono">{pct(S.realistic_low, 1)} – {pct(S.realistic_high, 1)}</b><span>author’s “realistic” estimate</span></div>
          <div><b className="mono">{card.model.train_samples.toLocaleString()}</b><span>training samples</span></div></div>
        <p className="small muted">Source: <a href={card.source} target="_blank" rel="noreferrer">{card.source.replace("https://", "")}</a> · {card.license} · {card.model.architecture}. Our own tests below are what we can stand behind for an unseen signer.</p>
      </section>

      <div className="two-col">
        <section className="card"><header className="card-head"><div><h2>Confusion matrix, our live tests</h2><p className="muted">Rows are the sign asked for, columns what the app committed.</p></div></header>
          {m.n ? <Heat attempts={A} names={names} /> : <Empty />}</section>
        <div className="stack">
          <section className="card"><header className="card-head"><div><h2>Accuracy vs. confidence threshold</h2><p className="muted">From our live tests. A stricter threshold shows fewer, safer answers.</p></div></header>
            {m.n ? <Curve curve={m.curve} chosen={cfg?.min_prob ?? 0.85} /> : <Empty />}</section>
          <section className="card info"><h2>Model</h2><dl>
            <div><dt>Name</dt><dd>{card.model.name}</dd></div><div><dt>Version</dt><dd className="mono">{cfg?.model_version.split("@")[1] ?? "—"}</dd></div>
            <div><dt>Input</dt><dd className="mono">{card.model.input_dim}-D · two 78-D hand slots</dd></div><div><dt>Gate</dt><dd className="mono">p ≥ {cfg?.min_prob} · margin ≥ {cfg?.min_margin}</dd></div>
            <div><dt>Hold / release</dt><dd className="mono">{cfg?.hold_ms} ms / {cfg?.release_ms} ms</dd></div><div><dt>Author</dt><dd>{card.author}</dd></div></dl></section>
        </div>
      </div>

      {hasPng && <section className="card"><header className="card-head"><div><h2>Author’s confusion matrix</h2><p className="muted">Image from the model card (block-split test, not our measurement).</p></div></header><img className="chart-img" src="/model/confusion_matrix_isl.png" alt="Confusion matrix published with the SignLens model" /></section>}

      <PerSign card={card} per={m.per} names={names} />

      <section className="card"><header className="card-head"><div><h2>Test runs</h2><p className="muted">Each run is anonymous. Delete a tester’s runs if they ask.</p></div></header>
        {live?.tests.length ? <div className="table-wrap"><table><thead><tr><th>Tester</th><th>When</th><th className="num">Attempts</th><th className="num">Correct</th><th /></tr></thead><tbody>
          {live.tests.map((t) => <tr key={t.id}><td className="mono">{t.tester}</td><td>{new Date(t.created_at).toLocaleString()}</td><td className="num mono">{t.attempts}</td><td className="num mono">{t.correct ?? 0}</td>
            <td className="num"><button className="btn btn-danger-ghost" onClick={async () => { await deleteTester(t.tester); setTries((n) => n + 1); }}><Icon name="trash" size={16} /> Delete {t.tester}</button></td></tr>)}</tbody></table></div> : <Empty />}</section>
    </div>
  );
}

const Empty = () => <p className="empty muted">No live tests recorded yet. Use <b>Live test</b> and this fills in automatically.</p>;

function Heat({ attempts, names }: { attempts: LiveData["attempts"]; names: Map<string, { short: string }> }) {
  const [norm, setNorm] = useState(true);
  const keys = [...names.keys()];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const used = keys.filter((k) => attempts.some((a) => a.target === k || a.predicted === k));
  const M = used.map(() => used.map(() => 0)), U = used.map(() => 0);
  for (const a of attempts) { const r = used.indexOf(a.target); if (r < 0) continue; if (a.predicted === null) U[r]++; else { const c = used.indexOf(a.predicted); if (c >= 0) M[r][c]++; } }
  const rowSum = M.map((r, i) => r.reduce((x, y) => x + y, 0) + U[i]);
  const max = Math.max(1, ...M.flat());
  void idx;
  return (
    <div className="heat">
      <div className="heat-ctl"><div className="segmented sm" role="radiogroup" aria-label="Matrix scale"><button role="radio" aria-checked={norm} className={norm ? "on" : ""} onClick={() => setNorm(true)}>% of row</button><button role="radio" aria-checked={!norm} className={!norm ? "on" : ""} onClick={() => setNorm(false)}>Counts</button></div></div>
      <div className="heat-scroll"><table><thead><tr><th className="corner">asked ↓ read →</th>{used.map((k) => <th key={k}>{names.get(k)?.short ?? k}</th>)}<th className="rej">Uncertain</th></tr></thead>
        <tbody>{M.map((row, i) => (<tr key={i}><th scope="row">{names.get(used[i])?.short ?? used[i]}</th>
          {row.map((v, j) => { const t = norm ? (rowSum[i] ? v / rowSum[i] : 0) : v / max; return <td key={j} className={i === j ? "diag" : v ? "off" : ""} style={{ background: v ? `rgba(79,70,229,${0.1 + 0.9 * Math.sqrt(t)})` : undefined, color: v && t > 0.45 ? "#fff" : undefined }} title={`Asked ${used[i]}, read ${used[j]}: ${v}`}>{v ? (norm ? Math.round(t * 100) : v) : ""}</td>; })}
          <td className="rej">{U[i] ? (norm ? Math.round((U[i] / rowSum[i]) * 100) : U[i]) : ""}</td></tr>))}</tbody></table></div>
      <p className="small muted">“Uncertain” means the gate refused to guess. That is better than a wrong word.</p>
    </div>
  );
}

function Curve({ curve, chosen }: { curve: { t: number; acc: number | null; cov: number }[]; chosen: number }) {
  const W = 520, H = 240, L = 44, R = 16, T = 14, B = 34;
  const vals = curve.flatMap((c) => [c.cov, ...(c.acc == null ? [] : [c.acc])]);
  const y0 = Math.max(0, Math.floor(Math.min(...vals, 0.9) * 10) / 10);
  const x = (t: number) => L + ((t - 0.5) / 0.5) * (W - L - R), y = (v: number) => T + (1 - (v - y0) / (1 - y0)) * (H - T - B);
  const path = (g: (c: (typeof curve)[0]) => number | null) => curve.filter((c) => g(c) != null).map((c, i) => `${i ? "L" : "M"}${x(c.t).toFixed(1)},${y(g(c)!).toFixed(1)}`).join(" ");
  const at = curve.reduce((a, c) => (Math.abs(c.t - chosen) < Math.abs(a.t - chosen) ? c : a), curve[0]);
  return (<div><svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Accuracy and coverage against threshold">
    {[y0, (y0 + 1) / 2, 1].map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 100)}%</text></g>)}
    {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="axis">{t}</text>)}
    <line x1={x(chosen)} x2={x(chosen)} y1={T} y2={H - B} className="chosen" /><path d={path((c) => c.cov)} className="line cov" /><path d={path((c) => c.acc)} className="line acc" />
    {at.acc != null && <circle cx={x(at.t)} cy={y(at.acc)} r="5" className="dot-acc" />}<circle cx={x(at.t)} cy={y(at.cov)} r="5" className="dot-cov" /></svg>
    <div className="chart-legend"><span><i className="acc" /> Accuracy of shown signs <b className="mono">{pct(at.acc)}</b></span><span><i className="cov" /> Coverage <b className="mono">{pct(at.cov)}</b></span><Chip kind="ok">Gate threshold {chosen}</Chip></div></div>);
}

type K = "name" | "f1" | "precision" | "recall" | "ours";
function PerSign({ card, per, names }: { card: Card; per: Map<string, { n: number; ok: number; unc: number }>; names: Map<string, { short: string; name: string }> }) {
  const [key, setKey] = useState<K>("f1"); const [dir, setDir] = useState<1 | -1>(1); const [q, setQ] = useState("");
  const ours = (k: string) => { const r = per.get(k); return r && r.n ? r.ok / r.n : null; };
  const rows = card.per_class.filter((r) => (r.key + (names.get(r.key)?.name ?? "")).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => key === "name" ? dir * a.key.localeCompare(b.key) : key === "ours" ? dir * ((ours(a.key) ?? 2) - (ours(b.key) ?? 2)) : dir * ((a as any)[key] - (b as any)[key]));
  const th = (k: K, label: string, cls = "") => <th className={cls} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}><button className="sort" onClick={() => { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } }}>{label}{key === k ? (dir === 1 ? " ▲" : " ▼") : ""}</button></th>;
  return (
    <section className="card table-card"><header className="card-head"><div><h2>Per-sign performance</h2><p className="muted">Author’s published precision and recall, next to our own live-test hit rate. Sorted weakest first by default.</p></div>
      <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sign" aria-label="Search sign" /></label></header>
      <div className="table-wrap"><table><thead><tr>{th("name", "Sign")}{th("precision", "Precision", "num")}{th("recall", "Recall", "num")}{th("f1", "F1", "num")}<th className="num">Test frames</th>{th("ours", "Our live test", "num")}<th>Status</th></tr></thead>
        <tbody>{rows.map((r) => { const o = ours(r.key); const pr = per.get(r.key); return (
          <tr key={r.key}><td><b>{r.key}</b> <span className="muted">{names.get(r.key)?.name}</span></td><td className="num mono">{pct(r.precision)}</td><td className="num mono">{pct(r.recall)}</td><td className="num mono">{r.f1.toFixed(3)}</td><td className="num mono">{r.support}</td>
            <td className="num mono">{o == null ? "—" : `${pct(o, 0)} (${pr!.ok}/${pr!.n})`}</td>
            <td>{r.f1 >= 0.97 ? <Chip kind="ok">Reliable</Chip> : r.f1 >= 0.9 ? <Chip kind="load">Good</Chip> : r.f1 >= 0.75 ? <Chip kind="warn">Moderate</Chip> : <Chip kind="err">Weak</Chip>}</td></tr>); })}</tbody></table></div></section>
  );
}
