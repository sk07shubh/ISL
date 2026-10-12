import { useEffect, useMemo, useState } from "react";
import { Chip, Icon, pct } from "../components/ui";
import { deleteTester, liveTests, type LiveData } from "../lib/api";
import { loadModel, loadVocab } from "../lib/runtime";
import type { ModelInfo, VocabEntry } from "../lib/types";
import { AppError } from "../lib/types";

export function Results() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [signs, setSigns] = useState<VocabEntry[]>([]);
  const [live, setLive] = useState<LiveData | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setErr(null);
    loadModel().then(setInfo).catch((e) => setErr(e instanceof AppError ? e : new AppError("bad_file", "backend", String(e))));
    loadVocab("alphabet").then((v) => setSigns(v.signs)).catch(() => {});
    liveTests().then(setLive).catch(() => setLive({ tests: [], attempts: [] }));
  }, [tries]);

  const A = live?.attempts ?? [];
  const m = useMemo(() => {
    const n = A.length, correct = A.filter((a) => a.predicted === a.target).length, unc = A.filter((a) => a.predicted === null).length;
    const shown = n - unc, wrong = shown - correct;
    const per = new Map<string, { n: number; ok: number; unc: number }>();
    for (const a of A) { const r = per.get(a.target) ?? { n: 0, ok: 0, unc: 0 }; r.n++; if (a.predicted === a.target) r.ok++; if (a.predicted === null) r.unc++; per.set(a.target, r); }
    const curve = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98].map((t) => {
      const sh = A.filter((a) => a.predicted !== null && (a.confidence ?? 0) >= t);
      return { t, acc: sh.length ? sh.filter((a) => a.predicted === a.target).length / sh.length : null, cov: n ? sh.length / n : 0 };
    });
    return { n, correct, unc, shown, wrong, per, curve, testers: new Set(A.map((a) => a.tester)).size };
  }, [A]);

  if (err) return <div className="page"><div className="card state-card error" role="alert"><Icon name="alert" size={40} /><h2>Model details are not available</h2><p>{err.message}</p><code className="file">{err.file}</code>
    <button className="btn btn-secondary" onClick={() => setTries((n) => n + 1)}><Icon name="refresh" size={18} /> Check again</button></div></div>;
  if (!info) return <div className="page"><div className="card state-card"><div className="spinner" /><p>Loading…</p></div></div>;

  const names = new Map(signs.map((v) => [v.key, v.name]));
  let perf: { ms: number; fps: number } | null = null; try { perf = JSON.parse(localStorage.getItem("isl.lastPerf") || "null"); } catch { /* ignore */ }
  const head = info.alphabet;
  const P = info.parity;

  return (
    <div className="page results">
      <header className="page-head"><div><h1>Model &amp; results</h1>
        <p className="muted">Our own measurements from the Live test. The model was trained by our team on the ISL dataset; no published benchmark numbers are shown here.</p></div>
        <div className="btn-row"><a className="btn btn-secondary" href="/test" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/test"); window.dispatchEvent(new PopStateEvent("popstate")); }}><Icon name="target" size={18} /> Run a live test</a>
          <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={18} /> Print / PDF</button></div></header>

      <section className="stats">
        <div className="card stat"><span className="stat-label">Measured accuracy</span>
          <b className="stat-num">{m.n ? (m.correct / m.n * 100).toFixed(1) : "—"}{m.n ? <small>%</small> : null}</b>
          <span className="muted">{m.n ? `${m.correct} of ${m.n} attempts correct, ${m.testers} tester${m.testers === 1 ? "" : "s"}` : "No live tests yet"}</span>
          <span className="stat-foot">{m.n ? <>Wrong answers shown <b className="mono">{m.wrong}</b> · stayed uncertain <b className="mono">{m.unc}</b></> : "Run a live test to fill this in"}</span></div>
        <div className="card stat"><span className="stat-label">Coverage</span>
          <b className="stat-num">{m.n ? (m.shown / m.n * 100).toFixed(1) : "—"}{m.n ? <small>%</small> : null}</b>
          <span className="muted">of attempts passed the confidence gate</span>
          <span className="stat-foot">{m.shown ? <>Accuracy when shown <b className="mono">{pct(m.correct / m.shown)}</b></> : `Threshold ${head.threshold}, averaged over ${info.gate.smooth} frames`}</span></div>
        <div className="card stat"><span className="stat-label">Avg time per frame</span>
          <b className="stat-num">{perf ? perf.ms.toFixed(0) : "—"}{perf ? <small> ms</small> : null}</b>
          <span className="muted">camera → hand points → classifier → answer</span>
          <span className="stat-foot">{perf ? <>Last live run <b className="mono">{perf.fps.toFixed(0)} fps</b></> : "Open the Interpreter once to measure"}</span></div>
        <div className="card stat"><span className="stat-label">Signs supported</span>
          <b className="stat-num">{head.labels.length}</b><span className="muted">static letters A–Z, one or two hands</span>
          <span className="stat-foot">{info.digit ? `Digits model installed (${info.digit.labels.length})` : "Digits model not installed yet"}</span></div>
      </section>

      <section className={`card banner-card ${P.ok ? "ok" : "bad"}`}>
        <header className="card-head"><div><h2>Parity with the training code</h2>
          <p className="muted">The backend recomputes the teammate’s saved fixture ({P.fixture}) on every start, using the same features.py and the exported weights.</p></div>
          <Chip kind={P.ok ? "ok" : "err"}>{P.ok ? "Matches" : "Mismatch"}</Chip></header>
        <div className="mini-stats wide">
          <div><b className="mono">{P.max_feature_diff.toExponential(1)}</b><span>max feature difference</span></div>
          <div><b className="mono">{P.max_prob_diff.toExponential(1)}</b><span>max probability difference</span></div>
          <div><b className="mono">{head.features}</b><span>input features</span></div>
          <div><b className="mono">{head.labels.length}</b><span>output classes</span></div></div>
      </section>

      <div className="two-col">
        <section className="card"><header className="card-head"><div><h2>Confusion matrix, live tests</h2><p className="muted">Rows are the sign asked for, columns what the app committed.</p></div></header>
          {m.n ? <Heat attempts={A} names={names} /> : <Empty />}</section>
        <div className="stack">
          <section className="card"><header className="card-head"><div><h2>Accuracy vs. confidence threshold</h2><p className="muted">From our live tests. A stricter threshold shows fewer, safer answers.</p></div></header>
            {m.n ? <Curve curve={m.curve} chosen={head.threshold} /> : <Empty />}</section>
          <section className="card info"><h2>Model</h2><dl>
            <div><dt>Name</dt><dd>{head.name}</dd></div>
            <div><dt>Architecture</dt><dd className="mono">{head.features} → 128 → 64 → {head.labels.length}</dd></div>
            <div><dt>Preprocessing</dt><dd className="mono">two hands · extras · no rotation</dd></div>
            <div><dt>Gate</dt><dd className="mono">p ≥ {head.threshold} · avg {info.gate.smooth} frames</dd></div>
            <div><dt>Hold / release</dt><dd className="mono">{info.gate.hold_ms} ms / {info.gate.release_ms} ms</dd></div>
            <div><dt>Source</dt><dd className="mono small">{info.source}</dd></div></dl></section>
        </div>
      </div>

      <PerSign signs={signs} per={m.per} />

      <section className="card"><header className="card-head"><div><h2>Test runs</h2><p className="muted">Each run is anonymous. Delete a tester’s runs if they ask.</p></div></header>
        {live?.tests.length ? <div className="table-wrap"><table><thead><tr><th>Tester</th><th>When</th><th className="num">Attempts</th><th className="num">Correct</th><th /></tr></thead><tbody>
          {live.tests.map((t) => <tr key={t.id}><td className="mono">{t.tester}</td><td>{new Date(t.created_at).toLocaleString()}</td><td className="num mono">{t.attempts}</td><td className="num mono">{t.correct ?? 0}</td>
            <td className="num"><button className="btn btn-danger-ghost" onClick={async () => { await deleteTester(t.tester); setTries((n) => n + 1); }}><Icon name="trash" size={16} /> Delete {t.tester}</button></td></tr>)}</tbody></table></div> : <Empty />}</section>
    </div>
  );
}

const Empty = () => <p className="empty muted">No live tests recorded yet. Use <b>Live test</b> and this fills in automatically.</p>;

function Heat({ attempts, names }: { attempts: LiveData["attempts"]; names: Map<string, string> }) {
  const [norm, setNorm] = useState(true);
  const used = [...names.keys()].filter((k) => attempts.some((a) => a.target === k || a.predicted === k));
  const M = used.map(() => used.map(() => 0)), U = used.map(() => 0);
  for (const a of attempts) { const r = used.indexOf(a.target); if (r < 0) continue; if (a.predicted === null) U[r]++; else { const c = used.indexOf(a.predicted); if (c >= 0) M[r][c]++; } }
  const rowSum = M.map((r, i) => r.reduce((x, y) => x + y, 0) + U[i]);
  const max = Math.max(1, ...M.flat());
  return (
    <div className="heat">
      <div className="heat-ctl"><div className="segmented sm" role="radiogroup" aria-label="Matrix scale"><button role="radio" aria-checked={norm} className={norm ? "on" : ""} onClick={() => setNorm(true)}>% of row</button><button role="radio" aria-checked={!norm} className={!norm ? "on" : ""} onClick={() => setNorm(false)}>Counts</button></div></div>
      <div className="heat-scroll"><table><thead><tr><th className="corner">asked ↓ read →</th>{used.map((k) => <th key={k}>{k}</th>)}<th className="rej">Uncertain</th></tr></thead>
        <tbody>{M.map((row, i) => (<tr key={i}><th scope="row">{used[i]}</th>
          {row.map((v, j) => { const t = norm ? (rowSum[i] ? v / rowSum[i] : 0) : v / max; return <td key={j} className={i === j ? "diag" : v ? "off" : ""} style={{ background: v ? `rgba(79,70,229,${0.1 + 0.9 * Math.sqrt(t)})` : undefined, color: v && t > 0.45 ? "#fff" : undefined }} title={`Asked ${used[i]}, read ${used[j]}: ${v}`}>{v ? (norm ? Math.round(t * 100) : v) : ""}</td>; })}
          <td className="rej">{U[i] ? (norm ? Math.round((U[i] / rowSum[i]) * 100) : U[i]) : ""}</td></tr>))}</tbody></table></div>
      <p className="small muted">“Uncertain” means the gate refused to guess. That is better than a wrong letter.</p>
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
    <div className="chart-legend"><span><i className="acc" /> Accuracy of shown signs <b className="mono">{pct(at.acc)}</b></span><span><i className="cov" /> Coverage <b className="mono">{pct(at.cov)}</b></span><Chip kind="ok">Threshold {chosen}</Chip></div></div>);
}

type K = "name" | "ours" | "tries";
function PerSign({ signs, per }: { signs: VocabEntry[]; per: Map<string, { n: number; ok: number; unc: number }> }) {
  const [key, setKey] = useState<K>("ours"); const [dir, setDir] = useState<1 | -1>(1); const [q, setQ] = useState("");
  const rows = signs.map((v) => { const r = per.get(v.key); return { key: v.key, n: r?.n ?? 0, ok: r?.ok ?? 0, unc: r?.unc ?? 0, rate: r && r.n ? r.ok / r.n : null }; })
    .filter((r) => r.key.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => key === "name" ? dir * a.key.localeCompare(b.key) : key === "tries" ? dir * (a.n - b.n) : dir * ((a.rate ?? 2) - (b.rate ?? 2)));
  const th = (k: K, label: string, cls = "") => <th className={cls} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}><button className="sort" onClick={() => { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } }}>{label}{key === k ? (dir === 1 ? " ▲" : " ▼") : ""}</button></th>;
  return (
    <section className="card table-card"><header className="card-head"><div><h2>Per-letter results</h2><p className="muted">Our live-test hit rate for each letter. Weakest first by default.</p></div>
      <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search letter" aria-label="Search letter" /></label></header>
      <div className="table-wrap"><table><thead><tr>{th("name", "Letter")}{th("tries", "Attempts", "num")}<th className="num">Correct</th><th className="num">Uncertain</th>{th("ours", "Hit rate", "num")}<th>Status</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}><td><b>{r.key}</b></td><td className="num mono">{r.n}</td><td className="num mono">{r.ok}</td><td className="num mono">{r.unc}</td><td className="num mono">{r.rate == null ? "—" : pct(r.rate, 0)}</td>
            <td>{r.n === 0 ? <Chip kind="idle">Not tested</Chip> : r.rate! >= 0.9 ? <Chip kind="ok">Reliable</Chip> : r.rate! >= 0.7 ? <Chip kind="warn">Moderate</Chip> : <Chip kind="err">Weak</Chip>}</td></tr>))}
        </tbody></table></div></section>
  );
}
