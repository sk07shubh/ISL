import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { Bar, Btn, Card, Chip, Segmented, pct } from "../components/ui";
import { Screen } from "./InterpreterScreen";
import { C, S, R } from "../theme";
import { getAnalytics, getLiveTests, deleteTester } from "../lib/api";
import { useModel } from "../lib/useModel";
import type { Analytics, LiveData, Summary } from "../lib/analyticsTypes";
import type { ModelInfo } from "../lib/types";
import { Header } from "../components/Header";

type Tab = "overview" | "signs" | "details" | "runs";
const TABS: [Tab, string][] = [["overview", "Overview"], ["signs", "Per sign"], ["details", "Details"], ["runs", "Runs"]];
const LIGHT: [string, string][] = [["", "Any light"], ["bright", "Bright"], ["dim", "Dim"], ["mixed", "Mixed"]];
const DIST: [string, string][] = [["", "Any distance"], ["near", "Near"], ["medium", "Medium"], ["far", "Far"]];

export function ResultsScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const [light, setLight] = useState("");
  const [dist, setDist] = useState("");
  const [a, setA] = useState<Analytics | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const { info } = useModel();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { getLiveTests().then(setLive).catch(() => setLive({ tests: [], attempts: [] })); }, [tick]);
  useEffect(() => {
    setError(null);
    getAnalytics({ lighting: light, distance: dist }).then(setA).catch((e: Error) => setError(e.message));
  }, [light, dist, tick]);

  if (error) return <Screen><Header /><Card><Text style={st.title}>Results are not available</Text><Text style={st.muted}>{error}</Text><Btn label="Try again" kind="primary" onPress={() => setTick((n) => n + 1)} /></Card></Screen>;
  if (!a) return <Screen><Header /><Card><Text style={st.muted}>Loading results…</Text></Card></Screen>;

  const o = a.overall;
  const empty = o.attempts === 0;

  return (
    <Screen>
      <Header />
      <Text style={st.title}>Model & results</Text>
      <Text style={st.muted}>How often the interpreter is right, how often it shows a wrong sign, and how often it stays unsure.</Text>

      <Segmented label="Lighting" value={light} options={LIGHT} onChange={setLight} />
      <Segmented label="Distance" value={dist} options={DIST} onChange={setDist} />
      <Text style={st.muted}>{a.tests} test{a.tests === 1 ? "" : "s"} · {a.testers} tester{a.testers === 1 ? "" : "s"} · {o.attempts} attempts</Text>

      <Segmented label="Sections" value={tab} options={TABS} onChange={setTab} />

      {empty && tab !== "runs" && <Card><Text style={st.h3}>No results yet</Text><Text style={st.muted}>Run a live test, or change the filters.</Text></Card>}

      {!empty && tab === "overview" && (<>
        <View style={st.grid}>
          <StatCard label="Accuracy" value={pct(o.accuracy_all, 1)} foot={`${o.correct} of ${o.attempts} read correctly`} />
          <StatCard label="Wrong signs shown" value={pct(o.wrong_shown_rate, 1)} foot={`target ≤ ${(a.wrong_shown_target * 100).toFixed(0)}%`} chip={(o.wrong_shown_rate ?? 0) <= a.wrong_shown_target ? "ok" : "err"} />
          <StatCard label="Answered" value={pct(o.coverage, 0)} foot={`correct when answered ${pct(o.precision_shown, 0)}`} />
          <StatCard label="Median time" value={o.median_time_ms != null ? `${(o.median_time_ms / 1000).toFixed(1)} s` : "—"} foot="from prompt to answer" />
        </View>
        <Card>
          <Text style={st.h3}>Safety vs. coverage</Text>
          <Text style={st.muted}>A higher bar answers less often, but wrong answers become rarer.</Text>
          <RiskChart a={a} />
          <Text style={st.muted}>
            {a.recommended_threshold != null
              ? `Recommended bar ${a.recommended_threshold.toFixed(2)} keeps wrong signs under ${(a.wrong_shown_target * 100).toFixed(0)}%. The app is set to ${a.threshold}.`
              : "A recommendation appears after 20 attempts."}
          </Text>
        </Card>
      </>)}

      {!empty && tab === "signs" && (
        <Card>
          <Text style={st.h3}>Per sign</Text>
          <Text style={st.muted}>Weakest first. Accuracy is how often the sign was read correctly when asked.</Text>
          {[...a.per_sign].sort((x, y) => (x.support ? x.tp / x.support : 2) - (y.support ? y.tp / y.support : 2)).map((r) => {
            const acc = r.support ? r.tp / r.support : null;
            return (
              <View key={r.key} style={st.signRow}>
                <Text style={st.signKey} numberOfLines={1}>{r.key}</Text>
                <View style={{ flex: 1 }}><Bar value={acc} color={(acc ?? 0) >= 0.9 ? C.ok : (acc ?? 0) >= 0.7 ? C.warn : C.err} /></View>
                <Text style={st.mono}>{r.support ? pct(acc, 0) : "—"}</Text>
                <Text style={st.muted}>{r.support} asked</Text>
              </View>
            );
          })}
        </Card>
      )}

      {!empty && tab === "details" && (<>
        <Card>
          <Text style={st.h3}>Does “90%” mean 90%?</Text>
          <Text style={st.muted}>For each confidence band: the stated confidence next to how often the interpreter was right.</Text>
          {a.calibration.bins.filter((b) => b.n > 0).map((b) => (
            <View key={String(b.lo)} style={st.calib}>
              <Text style={st.mono}>{(b.lo * 100).toFixed(0)}–{(Math.min(b.hi, 1) * 100).toFixed(0)}%</Text>
              <Bar value={b.mean_confidence} color={C.primary} /><Text style={st.muted}>stated {pct(b.mean_confidence, 0)}</Text>
              <Bar value={b.accuracy} color={C.ok} /><Text style={st.muted}>right {pct(b.accuracy, 0)} · n={b.n}</Text>
            </View>
          ))}
        </Card>
        {(["lighting", "distance", "hand_size", "brightness"] as const).map((k) => (
          <CondCard key={k} title={{ lighting: "Lighting", distance: "Distance", hand_size: "Hand size", brightness: "Brightness" }[k]} rows={a.by_condition[k]} />
        ))}
      </>)}

      {tab === "runs" && <RunsAndModel info={info} live={live} onChanged={() => setTick((n) => n + 1)} />}
    </Screen>
  );
}

function StatCard({ label, value, foot, chip }: { label: string; value: string; foot: string; chip?: "ok" | "err" }) {
  return (
    <Card style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Text style={st.muted}>{label}</Text>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.muted}>{foot}</Text>
      {chip && <Chip kind={chip}>{chip === "ok" ? "On target" : "Above target"}</Chip>}
    </Card>
  );
}

function RiskChart({ a }: { a: Analytics }) {
  const W = 320, H = 180, L = 8, R_ = 8, T = 8, B = 8;
  const pts = a.risk_coverage;
  const x = (t: number) => L + ((t - 0.5) / 0.48) * (W - L - R_);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const line = (get: (p: (typeof pts)[0]) => number | null) => pts.filter((p) => get(p) != null).map((p) => `${x(p.threshold).toFixed(1)},${y(get(p)!).toFixed(1)}`).join(" ");
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={L} x2={W - R_} y1={y(a.wrong_shown_target)} y2={y(a.wrong_shown_target)} stroke={C.err} strokeDasharray="4 4" />
      <Line x1={x(a.threshold)} x2={x(a.threshold)} y1={T} y2={H - B} stroke={C.ok} strokeDasharray="2 4" />
      <Polyline points={line((p) => p.precision_shown)} fill="none" stroke={C.primary} strokeWidth={2.5} />
      <Polyline points={line((p) => p.coverage)} fill="none" stroke={C.teal} strokeWidth={2.5} strokeDasharray="6 5" />
      <Polyline points={line((p) => p.wrong_shown_rate)} fill="none" stroke={C.err} strokeWidth={2.5} />
    </Svg>
  );
}

function CondCard({ title, rows }: { title: string; rows: Record<string, Summary> }) {
  const keys = Object.keys(rows ?? {});
  return (
    <Card>
      <Text style={st.h3}>{title}</Text>
      {keys.length === 0 ? <Text style={st.muted}>Nothing recorded yet.</Text> : keys.map((k) => (
        <View key={k} style={st.condRow}>
          <Text style={st.signKey}>{k}</Text>
          <Text style={st.muted}>{rows[k].attempts} tries</Text>
          <Text style={st.mono}>{pct(rows[k].accuracy_all, 0)} right</Text>
          <Text style={st.muted}>{pct(rows[k].wrong_shown_rate, 1)} wrong</Text>
        </View>))}
    </Card>
  );
}

function RunsAndModel({ info, live, onChanged }: { info: ModelInfo | null; live: LiveData | null; onChanged: () => void }) {
  return (<>
    <Card>
      <Text style={st.h3}>Models</Text>
      {info ? (<>
        {(["alphabet", "digit", "phrase"] as const).map((k) => (
          <Text key={k} style={st.muted}>{k === "alphabet" ? "Letters" : k === "digit" ? "Digits" : "Phrases"}: {info.heads[k].labels.length} signs · threshold {info.heads[k].threshold}</Text>
        ))}
        <Text style={st.muted}>Smoothing {info.gate.smooth} frames · stable {info.gate.stable} · hold {info.gate.hold_ms} ms</Text>
        <Chip kind={info.parity.ok ? "ok" : "err"}>{info.parity.ok ? "Matches the training code" : "Parity check failed"}</Chip>
      </>) : <Text style={st.muted}>Loading…</Text>}
    </Card>
    <Card>
      <Text style={st.h3}>Test runs</Text>
      {!live?.tests.length && <Text style={st.muted}>No live tests yet.</Text>}
      {live?.tests.map((t) => (
        <View key={t.id} style={st.condRow}>
          <Text style={st.signKey}>{t.tester}</Text>
          <Text style={st.muted}>{t.attempts} tries · {t.correct ?? 0} correct</Text>
          <Btn label="Delete" kind="ghost" onPress={() => Alert.alert("Delete runs?", `Delete all runs for ${t.tester}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => deleteTester(t.tester).then(onChanged) },
          ])} />
        </View>))}
    </Card>
  </>);
}

const st = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  h3: { fontSize: 18, fontWeight: "700", color: C.text },
  muted: { fontSize: 14, color: C.text3, lineHeight: 20 },
  mono: { fontSize: 15, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] },
  statValue: { fontSize: 36, fontWeight: "700", color: C.text, letterSpacing: -0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  signRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 4 },
  signKey: { width: 56, fontSize: 16, fontWeight: "700", color: C.text },
  calib: { gap: 4, paddingVertical: S.xs },
  condRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingVertical: S.xs, borderBottomWidth: 1, borderBottomColor: C.line },
});
