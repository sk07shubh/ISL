import { useEffect, useMemo, useState } from "react";
import { Bar, Chip, Icon, pct } from "../components/ui";
import { deleteTester, getAnalytics, liveTests, type Analytics, type LiveData, type Summary } from "../lib/api";
import { loadModel } from "../lib/runtime";
import type { ModelInfo } from "../lib/types";
import { AppError } from "../lib/types";

type Tab = "overview" | "letters" | "confusion" | "details" | "runs";
const TABS: { v: Tab; label: string }[] = [
  { v: "overview", label: "Overview" }, { v: "letters", label: "Per letter" }, { v: "confusion", label: "Confusion" },
  { v: "details", label: "Details" }, { v: "runs", label: "Runs & model" },
];
const LIGHT = [["", "Any light"], ["bright", "Bright"], ["dim", "Dim"], ["mixed", "Mixed"]] as const;
const DIST = [["", "Any distance"], ["near", "Near"], ["medium", "Medium"], ["far", "Far"]] as const;

export function Results() {
  const [tab, setTab] = useState<Tab>("overview");
  const [light, setLight] = useState("");
  const [dist, setDist] = useState("");
  const [a, setA] = useState<Analytics | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => { loadModel().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { liveTests().then(setLive).catch(() => setLive({ tests: [], attempts: [] })); }, [tries]);
  useEffect(() => {
    setErr(null);
    getAnalytics({ lighting: light, distance: dist }).then(setA).catch((e) => setErr(e instanceof AppError ? e : new AppError("bad_file", "backend", String(e))));
  }, [light, dist, tries]);

  if (err) return <div className="page"><div className="card state-card error" role="alert"><Icon name="alert" size={40} /><h2>Results are not available</h2><p>{err.message}</p>
    <button className="btn btn-secondary" onClick={() => setTries((n) => n + 1)}><Icon name="refresh" size={18} /> Check again</button></div></div>;
  if (!a) return <div className="page"><div className="card state-card"><div className="spinner" /><p>Loading results…</p></div></div>;

  const o = a.overall;
  const empty = o.attempts === 0;

  return (
    <div className="page results">
      <header className="page-head"><div><h1>Model &amp; results</h1>
        <p className="muted">How often the interpreter is right, how often it shows a wrong sign, and how often it stays unsure. Everything here comes from live tests anyone can run.</p></div>
        <div className="btn-row">
          <a className="btn btn-secondary" href="/test" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/test"); window.dispatchEvent(new PopStateEvent("popstate")); }}><Icon name="target" size={18} /> Run a live test</a>
          <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={18} /> Print / PDF</button></div></header>

      <div className="filters card">
        <div className="filter"><div className="segmented sm" role="radiogroup" aria-label="Lighting">{LIGHT.map(([v, t]) => <button key={v || "all"} role="radio" aria-checked={light === v} className={light === v ? "on" : ""} onClick={() => setLight(v)}>{t}</button>)}</div></div>
        <div className="filter"><div className="segmented sm" role="radiogroup" aria-label="Distance">{DIST.map(([v, t]) => <button key={v || "all"} role="radio" aria-checked={dist === v} className={dist === v ? "on" : ""} onClick={() => setDist(v)}>{t}</button>)}</div></div>
        <span className="muted small">{a.tests} test{a.tests === 1 ? "" : "s"} · {a.testers} tester{a.testers === 1 ? "" : "s"} · {o.attempts} attempts</span>
      </div>

      <nav className="tabs" aria-label="Results sections">
        {TABS.map((t) => <button key={t.v} className={tab === t.v ? "on" : ""} aria-current={tab === t.v ? "page" : undefined} onClick={() => setTab(t.v)}>{t.label}</button>)}
      </nav>

      {empty && tab !== "runs" && <div className="card state-card"><Icon name="target" size={36} /><h2>No results yet</h2>
        <p className="muted">Run a live test, or change the filters above.</p></div>}

      {!empty && tab === "overview" && (<>
        <section className="stats">
          <div className="card stat"><span className="stat-label">Accuracy</span>
            <b className="stat-num">{pct(o.accuracy_all, 1).replace("%", "")}<small>%</small></b>
            <span className="muted">{o.correct} of {o.attempts} attempts read correctly</span>
            <span className="stat-foot">Unsure answers count as not correct</span></div>
          <div className="card stat"><span className="stat-label">Wrong signs shown</span>
            <b className="stat-num">{o.wrong_shown_rate != null ? (o.wrong_shown_rate * 100).toFixed(1) : "—"}{o.wrong_shown_rate != null ? <small>%</small> : null}</b>
            <span className="muted">of attempts, a wrong sign was displayed</span>
            <span className="stat-foot"><Chip kind={(o.wrong_shown_rate ?? 0) <= a.wrong_shown_target ? "ok" : "err"}>target ≤ {(a.wrong_shown_target * 100).toFixed(0)}%</Chip></span></div>
          <div className="card stat"><span className="stat-label">Answered</span>
            <b className="stat-num">{o.coverage != null ? (o.coverage * 100).toFixed(0) : "—"}{o.coverage != null ? <small>%</small> : null}</b>
            <span className="muted">of attempts gave a sign; the rest stayed unsure</span>
            <span className="stat-foot">Correct when answered <b className="mono">{pct(o.precision_shown, 0)}</b></span></div>
          <div className="card stat"><span className="stat-label">Median time to answer</span>
            <b className="stat-num">{o.median_time_ms != null ? (o.median_time_ms / 1000).toFixed(1) : "—"}{o.median_time_ms != null ? <small> s</small> : null}</b>
            <span className="muted">from showing the letter to the interpreter's answer</span>
            <span className="stat-foot">Each letter has 8 seconds</span></div>
        </section>

        <section className="card">
          <header className="card-head"><div><h2>Safety vs. coverage</h2>
            <p className="muted">A higher confidence bar makes the interpreter answer less often, but wrong answers become rarer. The recommendation is the bar that answers most often while keeping wrong signs under the target.</p></div></header>
          <RiskChart a={a} />
          <div className="rec">
            {a.recommended_threshold != null
              ? <><Icon name="check" size={18} /> Recommended confidence bar: <b className="mono">{a.recommended_threshold.toFixed(2)}</b> keeps wrong signs under {(a.wrong_shown_target * 100).toFixed(0)}% and answers {pct(a.risk_coverage.find((c) => c.threshold === a.recommended_threshold)?.coverage ?? null, 0)} of attempts. The app is set to <b className="mono">{a.threshold}</b>.</>
              : <><Icon name="info" size={18} /> A recommendation appears after 20 attempts.</>}
          </div>
        </section>
      </>)}

      {!empty && tab === "letters" && <PerLetter a={a} />}

      {!empty && tab === "confusion" && (
        <section className="card"><header className="card-head"><div><h2>Confusion matrix</h2><p className="muted">Rows: the letter asked for. Columns: the letter the app showed. “Unsure” means it refused to guess.</p></div></header>
          <Heat labels={a.confusion.labels} m={a.confusion.matrix} unc={a.confusion.uncertain} /></section>
      )}

      {!empty && tab === "details" && (<>
        <section className="card">
          <header className="card-head"><div><h2>Does “90%” mean 90%?</h2>
            <p className="muted">For each confidence band, the stated confidence next to how often the interpreter was actually right.</p></div>
            <Chip kind={a.calibration.ece != null && a.calibration.ece <= 0.05 ? "ok" : "warn"}>Gap {a.calibration.ece != null ? pct(a.calibration.ece, 1) : "—"}</Chip></header>
          <Calib bins={a.calibration.bins} />
        </section>
        <div className="cond-grid">
          {([["lighting", "Lighting"], ["distance", "Distance"], ["hand_size", "Hand size in the image"], ["brightness", "Measured brightness"]] as const).map(([k, title]) => (
            <CondTable key={k} title={title} rows={a.by_condition[k]} />))}
          <p className="muted small foot">Hand size and brightness are measured automatically. Lighting and distance are whatever the tester noted.</p>
        </div>
      </>)}

      {tab === "runs" && <RunsAndModel info={info} live={live} onChanged={() => setTries((n) => n + 1)} />}
    </div>
  );
}

function RiskChart({ a }: { a: Analytics }) {
  const W = 560, H = 260, L = 46, R = 14, T = 14, B = 34;
  const pts = a.risk_coverage;
  const x = (t: number) => L + ((t - 0.5) / 0.48) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = (get: (p: (typeof pts)[0]) => number | null) => pts.filter((p) => get(p) != null).map((p, i) => `${i ? "L" : "M"}${x(p.threshold).toFixed(1)},${y(get(p)!).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Accuracy when answered, answered share, and wrong signs shown against the confidence bar">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 100)}%</text></g>)}
        {[0.5, 0.6, 0.7, 0.8, 0.9, 0.98].map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="axis">{t.toFixed(2)}</text>)}
        <line x1={L} x2={W - R} y1={y(a.wrong_shown_target)} y2={y(a.wrong_shown_target)} className="target-line" />
        <line x1={x(a.threshold)} x2={x(a.threshold)} y1={T} y2={H - B} className="chosen" />
        {a.recommended_threshold != null && <line x1={x(a.recommended_threshold)} x2={x(a.recommended_threshold)} y1={T} y2={H - B} className="recommended" />}
        <path d={path((p) => p.precision_shown)} className="line acc" />
        <path d={path((p) => p.coverage)} className="line cov" />
        <path d={path((p) => p.wrong_shown_rate)} className="line wrong" />
      </svg>
      <div className="chart-legend">
        <span><i className="acc" /> Correct when answered</span><span><i className="cov" /> Answered</span><span><i className="wrong" /> Wrong signs shown</span>
        <span><i className="chosen-i" /> Current bar</span>
      </div>
    </div>
  );
}

function Calib({ bins }: { bins: Analytics["calibration"]["bins"] }) {
  const rows = bins.filter((b) => b.n > 0);
  if (!rows.length) return <p className="empty muted">No attempts with a top prediction yet.</p>;
  return (
    <div className="calib">
      {rows.map((b) => (
        <div className="calib-row" key={`${b.lo}`}>
          <span className="mono">{(b.lo * 100).toFixed(0)}–{(Math.min(b.hi, 1) * 100).toFixed(0)}%</span>
          <div className="calib-bars">
            <div className="bar-line"><Bar value={b.mean_confidence ?? 0} kind="primary" label="stated confidence" /><span className="mono small">stated {pct(b.mean_confidence, 0)}</span></div>
            <div className="bar-line"><Bar value={b.accuracy ?? 0} kind="ok" label="actual accuracy" /><span className="mono small">right {pct(b.accuracy, 0)}</span></div>
          </div>
          <span className="mono small muted">n={b.n}</span>
        </div>
      ))}
    </div>
  );
}

function CondTable({ title, rows }: { title: string; rows: Record<string, Summary> }) {
  const keys = Object.keys(rows ?? {});
  return (
    <section className="card">
      <h3>{title}</h3>
      {keys.length === 0 ? <p className="muted small foot">Nothing recorded yet.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Group</th><th className="num">Attempts</th><th className="num">Accuracy</th><th className="num">Wrong shown</th><th className="num">Answered</th><th className="num">Median time</th></tr></thead>
          <tbody>{keys.map((k) => { const s = rows[k]; return (
            <tr key={k}><td>{k}</td><td className="num mono">{s.attempts}</td><td className="num mono">{pct(s.accuracy_all, 0)}</td><td className="num mono">{pct(s.wrong_shown_rate, 1)}</td><td className="num mono">{pct(s.coverage, 0)}</td>
              <td className="num mono">{s.median_time_ms != null ? (s.median_time_ms / 1000).toFixed(1) + " s" : "—"}</td></tr>); })}</tbody></table></div>)}
    </section>
  );
}

type K = "name" | "accuracy" | "wrong" | "asked";
function PerLetter({ a }: { a: Analytics }) {
  const [key, setKey] = useState<K>("accuracy"); const [dir, setDir] = useState<1 | -1>(1); const [q, setQ] = useState("");
  const rows = useMemo(() => a.per_sign.filter((r) => r.key.toLowerCase().includes(q.toLowerCase())).map((r) => ({
    ...r, correct: r.tp, wrong: r.predicted - r.tp, acc: r.support ? r.tp / r.support : null,
  })).sort((x, y) => {
    if (key === "name") return dir * x.key.localeCompare(y.key);
    const xv = key === "accuracy" ? x.acc : key === "wrong" ? x.wrong : x.support;
    const yv = key === "accuracy" ? y.acc : key === "wrong" ? y.wrong : y.support;
    return dir * ((xv ?? 2) - (yv ?? 2));
  }), [a, key, dir, q]);
  const th = (k: K, label: string, cls = "") => <th className={cls} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}><button className="sort" onClick={() => { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } }}>{label}{key === k ? (dir === 1 ? " ▲" : " ▼") : ""}</button></th>;
  return (
    <section className="card table-card"><header className="card-head"><div><h2>Per letter</h2>
      <p className="muted">Accuracy is how often the letter was read correctly when asked. Weakest letters are listed first.</p></div>
      <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search letter" aria-label="Search letter" /></label></header>
      <div className="table-wrap"><table><thead><tr>{th("name", "Letter")}{th("asked", "Asked", "num")}<th className="num">Correct</th>{th("wrong", "Wrong shown", "num")}<th className="num">Unsure</th>{th("accuracy", "Accuracy", "num")}<th className="num">Precision</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}><td><b>{r.key}</b></td><td className="num mono">{r.support}</td><td className="num mono">{r.correct}</td><td className="num mono">{r.wrong}</td><td className="num mono">{r.uncertain}</td>
            <td className="num mono">{pct(r.acc, 0)}</td><td className="num mono">{pct(r.precision, 0)}</td>
            <td>{r.support === 0 ? <Chip kind="idle">Not tested</Chip> : (r.acc ?? 0) >= 0.9 ? <Chip kind="ok">Reliable</Chip> : (r.acc ?? 0) >= 0.7 ? <Chip kind="warn">Moderate</Chip> : <Chip kind="err">Weak</Chip>}</td></tr>))}
        </tbody></table></div></section>
  );
}

function Heat({ labels, m, unc }: { labels: string[]; m: number[][]; unc: number[] }) {
  const [norm, setNorm] = useState(true);
  const used = labels.map((_, i) => i).filter((i) => m[i].some((x) => x) || unc[i] || m.some((r) => r[i]));
  const rowSum = labels.map((_, i) => m[i].reduce((x, y) => x + y, 0) + unc[i]);
  const max = Math.max(1, ...m.flat());
  return (
    <div className="heat">
      <div className="heat-ctl"><div className="segmented sm" role="radiogroup" aria-label="Matrix scale"><button role="radio" aria-checked={norm} className={norm ? "on" : ""} onClick={() => setNorm(true)}>% of row</button><button role="radio" aria-checked={!norm} className={!norm ? "on" : ""} onClick={() => setNorm(false)}>Counts</button></div></div>
      {used.length === 0 ? <p className="empty muted">Nothing to show yet.</p> : (
      <div className="heat-scroll"><table><thead><tr><th className="corner">asked ↓ shown →</th>{used.map((j) => <th key={j}>{labels[j]}</th>)}<th className="rej">Unsure</th></tr></thead>
        <tbody>{used.map((i) => (<tr key={i}><th scope="row">{labels[i]}</th>
          {used.map((j) => { const v = m[i][j]; const t = norm ? (rowSum[i] ? v / rowSum[i] : 0) : v / max; return <td key={j} className={i === j ? "diag" : v ? "off" : ""} style={{ background: v ? `rgba(79,70,229,${0.1 + 0.9 * Math.sqrt(t)})` : undefined, color: v && t > 0.45 ? "#fff" : undefined }} title={`Asked ${labels[i]}, shown ${labels[j]}: ${v}`}>{v ? (norm ? Math.round(t * 100) : v) : ""}</td>; })}
          <td className="rej">{unc[i] ? (norm ? Math.round((unc[i] / (rowSum[i] || 1)) * 100) : unc[i]) : ""}</td></tr>))}</tbody></table></div>)}
    </div>
  );
}

function RunsAndModel({ info, live, onChanged }: { info: ModelInfo | null; live: LiveData | null; onChanged: () => void }) {
  return (<>
    <section className="card info"><h2>Model</h2>{info ? <dl>
      <div><dt>Name</dt><dd className="mono">{info.alphabet.name}</dd></div>
      <div><dt>Input</dt><dd className="mono">{info.alphabet.features} values per frame</dd></div>
      <div><dt>Confidence bar</dt><dd className="mono">{info.alphabet.threshold}</dd></div>
      <div><dt>Smoothing / hold / release</dt><dd className="mono">{info.gate.smooth} frames · {info.gate.hold_ms} ms · {info.gate.release_ms} ms</dd></div>
      <div><dt>Matches the training code</dt><dd>{info.parity.ok ? <Chip kind="ok">Yes</Chip> : <Chip kind="err">No</Chip>}</dd></div>
    </dl> : <p className="muted">Loading…</p>}</section>
    <section className="card table-card"><header className="card-head"><div><h2>Test runs</h2><p className="muted">Every run, unfiltered. Delete any run you want removed.</p></div></header>
      {live?.tests.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Lighting</th><th>Distance</th><th>When</th><th className="num">Attempts</th><th className="num">Correct</th><th /></tr></thead><tbody>
        {live.tests.map((t) => <tr key={t.id}><td className="mono">{t.tester}</td><td>{t.lighting ?? "—"}</td><td>{t.distance ?? "—"}</td>
          <td>{new Date(t.created_at).toLocaleString()}</td><td className="num mono">{t.attempts}</td><td className="num mono">{t.correct ?? 0}</td>
          <td className="num"><button className="btn btn-danger-ghost" onClick={async () => { await deleteTester(t.tester); onChanged(); }}><Icon name="trash" size={16} /> Delete</button></td></tr>)}</tbody></table></div>
        : <p className="empty muted">No live tests recorded yet.</p>}
    </section>
  </>);
}
