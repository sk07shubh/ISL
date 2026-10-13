import { useEffect, useMemo, useState } from "react";
import { Bar, Chip, Icon, pct } from "../components/ui";
import { deleteTester, getAnalytics, liveTests, type Analytics, type LiveData, type Summary } from "../lib/api";
import { loadModel } from "../lib/runtime";
import type { ModelInfo } from "../lib/types";
import { AppError } from "../lib/types";

type Tab = "overview" | "signs" | "conditions" | "confusion" | "runs";
const TABS: { v: Tab; label: string }[] = [
  { v: "overview", label: "Overview" }, { v: "signs", label: "Per sign" }, { v: "conditions", label: "Conditions" },
  { v: "confusion", label: "Confusion" }, { v: "runs", label: "Runs & model" },
];
const FILTERS = {
  signer_type: [["", "All signers"], ["unseen", "Unseen signer"], ["seen", "Seen in training"]],
  lighting: [["", "Any light"], ["bright", "Bright"], ["dim", "Dim"], ["mixed", "Mixed"]],
  distance: [["", "Any distance"], ["near", "Near"], ["medium", "Medium"], ["far", "Far"]],
} as const;
type FilterKey = keyof typeof FILTERS;

export function Results() {
  const [tab, setTab] = useState<Tab>("overview");
  const [f, setF] = useState<Record<FilterKey, string>>({ signer_type: "", lighting: "", distance: "" });
  const [a, setA] = useState<Analytics | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => { loadModel().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { liveTests().then(setLive).catch(() => setLive({ tests: [], attempts: [] })); }, [tries]);
  useEffect(() => {
    setErr(null);
    getAnalytics(f).then(setA).catch((e) => setErr(e instanceof AppError ? e : new AppError("bad_file", "backend", String(e))));
  }, [f.signer_type, f.lighting, f.distance, tries]);

  if (err) return <div className="page"><div className="card state-card error" role="alert"><Icon name="alert" size={40} /><h2>Results are not available</h2><p>{err.message}</p>
    <button className="btn btn-secondary" onClick={() => setTries((n) => n + 1)}><Icon name="refresh" size={18} /> Check again</button></div></div>;
  if (!a) return <div className="page"><div className="card state-card"><div className="spinner" /><p>Loading analysis…</p></div></div>;

  const o = a.overall, u = a.unseen_signer;
  const empty = o.attempts === 0;

  return (
    <div className="page results">
      <header className="page-head"><div><h1>Model &amp; results</h1>
        <p className="muted">How accurate the interpreter is, how often it shows a wrong sign, and whether it knows when it is unsure. Every number is measured in our live tests.</p></div>
        <div className="btn-row">
          <a className="btn btn-secondary" href="/test" onClick={(e) => { e.preventDefault(); history.pushState({}, "", "/test"); window.dispatchEvent(new PopStateEvent("popstate")); }}><Icon name="target" size={18} /> Run a live test</a>
          <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={18} /> Print / PDF</button></div></header>

      <div className="filters card" role="group" aria-label="Filter results">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <div className="filter" key={k}>
            <div className="segmented sm" role="radiogroup" aria-label={k}>
              {FILTERS[k].map(([v, label]) => <button key={v || "all"} role="radio" aria-checked={f[k] === v} className={f[k] === v ? "on" : ""} onClick={() => setF({ ...f, [k]: v })}>{label}</button>)}
            </div></div>))}
        <span className="muted small">{a.tests} test{a.tests === 1 ? "" : "s"} · {a.testers} tester{a.testers === 1 ? "" : "s"} · {o.attempts} attempts</span>
      </div>

      <nav className="tabs" aria-label="Results sections">
        {TABS.map((t) => <button key={t.v} className={tab === t.v ? "on" : ""} aria-current={tab === t.v ? "page" : undefined} onClick={() => setTab(t.v)}>{t.label}</button>)}
      </nav>

      {empty && <div className="card state-card"><Icon name="target" size={36} /><h2>No results for this filter yet</h2>
        <p className="muted">Run a live test with these conditions, or change the filters above.</p></div>}

      {!empty && tab === "overview" && (<>
        <section className="stats">
          <div className="card stat"><span className="stat-label">Unseen-signer accuracy</span>
            <b className="stat-num">{u ? (u.accuracy_all! * 100).toFixed(1) : "—"}{u ? <small>%</small> : null}</b>
            <span className="muted">{u ? `${u.correct} of ${u.attempts} attempts, ${a.unseen_testers} unseen signer${a.unseen_testers === 1 ? "" : "s"}` : "No unseen-signer test yet"}</span>
            <span className="stat-foot">{u ? "The PS measure: accuracy on people the model never saw" : "Choose “Unseen signer” when testing a new person"}</span></div>
          <div className="card stat"><span className="stat-label">Wrong signs shown</span>
            <b className="stat-num">{o.wrong_shown_rate != null ? (o.wrong_shown_rate * 100).toFixed(1) : "—"}{o.wrong_shown_rate != null ? <small>%</small> : null}</b>
            <span className="muted">of attempts, the interpreter showed a wrong sign</span>
            <span className="stat-foot"><Chip kind={(o.wrong_shown_rate ?? 0) <= a.wrong_shown_target ? "ok" : "err"}>target ≤ {(a.wrong_shown_target * 100).toFixed(0)}%</Chip></span></div>
          <div className="card stat"><span className="stat-label">Answered (coverage)</span>
            <b className="stat-num">{o.coverage != null ? (o.coverage * 100).toFixed(0) : "—"}{o.coverage != null ? <small>%</small> : null}</b>
            <span className="muted">of attempts shown; the rest stayed Uncertain</span>
            <span className="stat-foot">Precision when shown <b className="mono">{pct(o.precision_shown, 1)}</b></span></div>
          <div className="card stat"><span className="stat-label">Median time to answer</span>
            <b className="stat-num">{o.median_time_ms != null ? (o.median_time_ms / 1000).toFixed(1) : "—"}{o.median_time_ms != null ? <small> s</small> : null}</b>
            <span className="muted">from showing the letter to a decision</span>
            <span className="stat-foot">Timeout {8} s</span></div>
        </section>

        <div className="two-col">
          <section className="card">
            <header className="card-head"><div><h2>Safety vs. coverage</h2>
              <p className="muted">As the confidence threshold rises, the app answers less often but gets wrong less often. The recommended threshold answers as often as possible while keeping wrong signs under the target.</p></div></header>
            <RiskChart a={a} />
            <div className="rec">
              {a.recommended_threshold != null
                ? <><Icon name="check" size={18} /> Recommended threshold <b className="mono">{a.recommended_threshold.toFixed(2)}</b> keeps wrong signs under {(a.wrong_shown_target * 100).toFixed(0)}% (current: <b className="mono">{a.threshold}</b>).</>
                : <><Icon name="info" size={18} /> A recommendation needs at least 20 attempts under this filter.</>}
            </div>
          </section>
          <section className="card">
            <header className="card-head"><div><h2>Does “90%” mean 90%?</h2>
              <p className="muted">Within each confidence band, how often the top prediction was right. Closer bars mean better-calibrated confidence.</p></div>
              <Chip kind={a.calibration.ece != null && a.calibration.ece <= 0.05 ? "ok" : "warn"}>ECE {a.calibration.ece != null ? pct(a.calibration.ece, 1) : "—"}</Chip></header>
            <Calib bins={a.calibration.bins} />
          </section>
        </div>

        <section className="card table-card">
          <header className="card-head"><div><h2>Per signer</h2><p className="muted">Each tester on their own. Accuracy should hold up for signers the model never saw.</p></div></header>
          {Object.keys(a.per_signer).length === 0 ? <p className="empty muted">No tests yet.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Tester</th><th>Signer</th><th className="num">Attempts</th><th className="num">Accuracy</th><th className="num">Wrong shown</th><th className="num">Coverage</th></tr></thead>
              <tbody>{Object.entries(a.per_signer).map(([t, s]) => (
                <tr key={t}><td className="mono">{t}</td><td>{s.signer_type === "unseen" ? <Chip kind="ok">Unseen</Chip> : s.signer_type === "seen" ? <Chip kind="idle">Seen</Chip> : <Chip kind="idle">Not recorded</Chip>}</td>
                  <td className="num mono">{s.attempts}</td><td className="num mono">{pct(s.accuracy_all, 0)}</td><td className="num mono">{pct(s.wrong_shown_rate, 1)}</td><td className="num mono">{pct(s.coverage, 0)}</td></tr>))}</tbody></table></div>)}
        </section>
      </>)}

      {!empty && tab === "signs" && <PerSign a={a} />}

      {!empty && tab === "conditions" && (<div className="cond-grid">
        {[["signer_type", "Signer"], ["lighting", "Lighting"], ["distance", "Distance (recorded)"], ["hand_size", "Hand size in image"], ["brightness", "Measured brightness"]].map(([k, title]) => (
          <CondTable key={k} title={title} rows={a.by_condition[k]} />))}
        <p className="muted small foot">Hand size and brightness are measured by the app during each attempt. The bands are a starting point and should be tuned on real data.</p>
      </div>)}

      {!empty && tab === "confusion" && (
        <section className="card"><header className="card-head"><div><h2>Confusion matrix</h2><p className="muted">Rows: the letter asked for. Columns: the letter the app showed. “Uncertain” means it refused to guess.</p></div></header>
          <Heat labels={a.confusion.labels} m={a.confusion.matrix} unc={a.confusion.uncertain} /></section>
      )}

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
  const target = a.wrong_shown_target;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Coverage, precision and wrong-shown rate against confidence threshold">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 100)}%</text></g>)}
        {[0.5, 0.6, 0.7, 0.8, 0.9, 0.98].map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="axis">{t.toFixed(2)}</text>)}
        <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} className="target-line" />
        <line x1={x(a.threshold)} x2={x(a.threshold)} y1={T} y2={H - B} className="chosen" />
        {a.recommended_threshold != null && <line x1={x(a.recommended_threshold)} x2={x(a.recommended_threshold)} y1={T} y2={H - B} className="recommended" />}
        <path d={path((p) => p.precision_shown)} className="line acc" />
        <path d={path((p) => p.coverage)} className="line cov" />
        <path d={path((p) => p.wrong_shown_rate)} className="line wrong" />
      </svg>
      <div className="chart-legend">
        <span><i className="acc" /> Precision when shown</span><span><i className="cov" /> Coverage</span><span><i className="wrong" /> Wrong signs shown</span>
        <span><i className="chosen-i" /> Current threshold</span>
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
      {keys.length === 0 ? <p className="muted small foot">Nothing recorded for this breakdown yet.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Group</th><th className="num">Attempts</th><th className="num">Accuracy</th><th className="num">Wrong shown</th><th className="num">Coverage</th><th className="num">Median time</th></tr></thead>
          <tbody>{keys.map((k) => { const s = rows[k]; return (
            <tr key={k}><td>{k}</td><td className="num mono">{s.attempts}</td><td className="num mono">{pct(s.accuracy_all, 0)}</td><td className="num mono">{pct(s.wrong_shown_rate, 1)}</td><td className="num mono">{pct(s.coverage, 0)}</td>
              <td className="num mono">{s.median_time_ms != null ? (s.median_time_ms / 1000).toFixed(1) + " s" : "—"}</td></tr>); })}</tbody></table></div>)}
    </section>
  );
}

type K = "name" | "f1" | "precision" | "recall" | "support";
function PerSign({ a }: { a: Analytics }) {
  const [key, setKey] = useState<K>("f1"); const [dir, setDir] = useState<1 | -1>(1); const [q, setQ] = useState("");
  const rows = useMemo(() => a.per_sign.filter((r) => r.key.toLowerCase().includes(q.toLowerCase())).sort((x, y) => {
    if (key === "name") return dir * x.key.localeCompare(y.key);
    const xv = (x as any)[key === "support" ? "support" : key] ?? -1, yv = (y as any)[key === "support" ? "support" : key] ?? -1;
    return dir * (xv - yv);
  }), [a, key, dir, q]);
  const th = (k: K, label: string, cls = "") => <th className={cls} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}><button className="sort" onClick={() => { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } }}>{label}{key === k ? (dir === 1 ? " ▲" : " ▼") : ""}</button></th>;
  return (
    <section className="card table-card"><header className="card-head"><div><h2>Per-sign precision, recall and F1</h2>
      <p className="muted">Precision: of the times the app showed this letter, how often it was right. Recall: of the times this letter was asked, how often it was shown correctly. Sorted weakest first.</p></div>
      <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search letter" aria-label="Search letter" /></label></header>
      <div className="table-wrap"><table><thead><tr>{th("name", "Letter")}{th("support", "Asked", "num")}<th className="num">Shown</th>{th("precision", "Precision", "num")}{th("recall", "Recall", "num")}{th("f1", "F1", "num")}<th className="num">Uncertain</th><th className="num">Median time</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}><td><b>{r.key}</b></td><td className="num mono">{r.support}</td><td className="num mono">{r.predicted}</td><td className="num mono">{pct(r.precision, 0)}</td><td className="num mono">{pct(r.recall, 0)}</td><td className="num mono">{r.f1 != null ? r.f1.toFixed(2) : "—"}</td>
            <td className="num mono">{r.uncertain}</td><td className="num mono">{r.median_time_ms != null ? (r.median_time_ms / 1000).toFixed(1) + " s" : "—"}</td>
            <td>{r.support === 0 ? <Chip kind="idle">Not tested</Chip> : r.f1! >= 0.9 ? <Chip kind="ok">Reliable</Chip> : r.f1! >= 0.7 ? <Chip kind="warn">Moderate</Chip> : <Chip kind="err">Weak</Chip>}</td></tr>))}
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
      <div className="heat-scroll"><table><thead><tr><th className="corner">asked ↓ shown →</th>{used.map((j) => <th key={j}>{labels[j]}</th>)}<th className="rej">Uncertain</th></tr></thead>
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
      <div><dt>Architecture</dt><dd className="mono">{info.alphabet.features} → 128 → 64 → {info.alphabet.labels.length}</dd></div>
      <div><dt>Confidence threshold</dt><dd className="mono">{info.alphabet.threshold}</dd></div>
      <div><dt>Smoothing / hold / release</dt><dd className="mono">{info.gate.smooth} frames · {info.gate.hold_ms} ms · {info.gate.release_ms} ms</dd></div>
      <div><dt>Parity with training code</dt><dd>{info.parity.ok ? <Chip kind="ok">Matches (feature Δ {info.parity.max_feature_diff.toExponential(1)}, prob Δ {info.parity.max_prob_diff.toExponential(1)})</Chip> : <Chip kind="err">Mismatch</Chip>}</dd></div>
    </dl> : <p className="muted">Loading…</p>}</section>
    <section className="card table-card"><header className="card-head"><div><h2>Test runs</h2><p className="muted">All runs, unfiltered. Each is anonymous; delete a tester’s runs if they ask.</p></div></header>
      {live?.tests.length ? <div className="table-wrap"><table><thead><tr><th>Tester</th><th>Signer</th><th>Lighting</th><th>Distance</th><th>When</th><th className="num">Attempts</th><th className="num">Correct</th><th /></tr></thead><tbody>
        {live.tests.map((t) => <tr key={t.id}><td className="mono">{t.tester}</td>
          <td>{t.signer_type === "unseen" ? "Unseen" : t.signer_type === "seen" ? "Seen" : "—"}</td><td>{t.lighting ?? "—"}</td><td>{t.distance ?? "—"}</td>
          <td>{new Date(t.created_at).toLocaleString()}</td><td className="num mono">{t.attempts}</td><td className="num mono">{t.correct ?? 0}</td>
          <td className="num"><button className="btn btn-danger-ghost" onClick={async () => { await deleteTester(t.tester); onChanged(); }}><Icon name="trash" size={16} /> Delete {t.tester}</button></td></tr>)}</tbody></table></div>
        : <p className="empty muted">No live tests recorded yet.</p>}
    </section>
  </>);
}
