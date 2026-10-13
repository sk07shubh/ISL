import { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Svg, { Line, Polyline } from "react-native-svg";
import { Bar, Btn, Card, Chip, pct } from "../components/ui";
import { Screen } from "./InterpreterScreen";
import { Header } from "../components/Header";
import { C, S } from "../theme";
import { loadHistory, deleteTest, type TestRecord } from "../lib/history";
import * as A from "../lib/analytics";

const WHAT: Record<TestRecord["what"], string> = { all: "Everything", alphabet: "Letters", digit: "Digits", phrase: "Phrases" };
const LIGHT: Record<string, string> = { bright: "Bright", dim: "Dim", mixed: "Mixed" };
const DIST: Record<string, string> = { near: "Near", medium: "Medium", far: "Far" };

/** The settings a test was run with, as short labels: "Everything · Dim · Far". */
export function comboLabel(t: TestRecord) {
  return [WHAT[t.what], t.lighting ? LIGHT[t.lighting] : "Light not noted", t.distance ? DIST[t.distance] : "Distance not noted"].join(" · ");
}

export function HistoryScreen() {
  const focused = useIsFocused();
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = () => loadHistory().then(setTests);
  useEffect(() => { if (focused) refresh(); }, [focused]);

  const open = tests.find((t) => t.id === openId) ?? null;
  const index = open ? tests.findIndex((t) => t.id === open.id) : -1;

  const remove = (t: TestRecord) => {
    Alert.alert(`Delete Test ${t.id}?`, "Its results will be erased from this phone. Other tests keep their numbers.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteTest(t.id);
        if (openId === t.id) setOpenId(null);
        refresh();
      } },
    ]);
  };

  if (open) {
    return <Detail test={open} index={index} total={tests.length}
      onPrev={() => setOpenId(tests[index - 1].id)} onNext={() => setOpenId(tests[index + 1].id)}
      onBack={() => setOpenId(null)} onDelete={() => remove(open)} />;
  }

  return (
    <Screen>
      <Header />
      <Text style={st.title}>History</Text>
      <Text style={st.muted}>Each live test is saved on this phone as a numbered test. Tap one to see its results.</Text>
      {tests.length === 0 && <Card><Text style={st.h3}>No tests yet</Text><Text style={st.muted}>Run a live test and it appears here.</Text></Card>}
      {tests.map((t) => {
        const s = A.summary(t.rows, t.threshold);
        return (
          <Card key={t.id}>
            <View style={st.row}>
              <Text style={st.h3}>Test {t.id}</Text>
              <Text style={st.muted}>{new Date(t.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={st.combo}>{comboLabel(t)}</Text>
            <View style={st.row}>
              <Text style={st.big}>{pct(s.accuracy_all, 0)}</Text>
              <Text style={st.muted}>{s.correct} of {s.attempts} correct · {s.wrong_shown} wrong · {s.uncertain} unsure</Text>
            </View>
            <View style={st.row}>
              <Btn label="View" kind="primary" onPress={() => setOpenId(t.id)} />
              <Btn label="Delete" kind="ghost" onPress={() => remove(t)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

function Detail({ test, index, total, onPrev, onNext, onBack, onDelete }: {
  test: TestRecord; index: number; total: number; onPrev: () => void; onNext: () => void; onBack: () => void; onDelete: () => void;
}) {
  const s = A.summary(test.rows, test.threshold);
  const curve = useMemo(() => A.riskCoverage(test.rows), [test]);
  const perSign = useMemo(() => A.perSign(test.rows, test.threshold, test.labels), [test]);
  const cal = useMemo(() => A.calibration(test.rows), [test]);

  return (
    <Screen>
      <Header />
      <View style={st.row}>
        <Btn label="Back" onPress={onBack} />
        <Text style={st.muted}>{index + 1} of {total}</Text>
      </View>
      <Text style={st.title}>Test {test.id}</Text>
      <Text style={st.combo}>{comboLabel(test)}</Text>
      {test.tester !== "anon" && <Text style={st.muted}>Name: {test.tester}</Text>}

      <View style={st.row}>
        <Btn label="← Previous" onPress={onPrev} disabled={index === 0} />
        <Btn label="Next →" onPress={onNext} disabled={index === total - 1} />
      </View>

      <View style={st.grid}>
        <Stat label="Accuracy" value={pct(s.accuracy_all, 1)} foot={`${s.correct} of ${s.attempts} read correctly`} />
        <Stat label="Wrong signs shown" value={pct(s.wrong_shown_rate, 1)} foot={`target ≤ ${(A.WRONG_SHOWN_TARGET * 100).toFixed(0)}%`} chip={(s.wrong_shown_rate ?? 0) <= A.WRONG_SHOWN_TARGET ? "ok" : "err"} />
        <Stat label="Answered" value={pct(s.coverage, 0)} foot={`correct when answered ${pct(s.precision_shown, 0)}`} />
        <Stat label="Median time" value={s.median_time_ms != null ? `${(s.median_time_ms / 1000).toFixed(1)} s` : "—"} foot="from prompt to answer" />
      </View>

      <Card>
        <Text style={st.h3}>Safety vs. coverage</Text>
        <Text style={st.muted}>Higher bar: fewer answers, fewer wrong ones.</Text>
        <RiskChart curve={curve} threshold={test.threshold} />
      </Card>

      <Card>
        <Text style={st.h3}>Per sign</Text>
        {perSign.filter((p) => p.support > 0).sort((a, b) => (a.recall ?? 0) - (b.recall ?? 0)).map((p) => (
          <View key={p.key} style={st.signRow}>
            <Text style={st.signKey} numberOfLines={1}>{p.key}</Text>
            <View style={{ flex: 1 }}><Bar value={p.recall} color={(p.recall ?? 0) >= 0.9 ? C.ok : (p.recall ?? 0) >= 0.7 ? C.warn : C.err} /></View>
            <Text style={st.mono}>{pct(p.recall, 0)}</Text>
          </View>
        ))}
        {perSign.every((p) => p.support === 0) && <Text style={st.muted}>No signs were asked.</Text>}
      </Card>

      <Card>
        <Text style={st.h3}>Does “90%” mean 90%?</Text>
        {cal.bins.filter((b) => b.n > 0).map((b) => (
          <Text key={String(b.lo)} style={st.muted}>{(b.lo * 100).toFixed(0)}–{(b.hi * 100).toFixed(0)}%: stated {pct(b.mean_confidence, 0)}, right {pct(b.accuracy, 0)} (n={b.n})</Text>
        ))}
        {cal.n === 0 && <Text style={st.muted}>No predictions to check.</Text>}
      </Card>

      <Btn label={`Delete Test ${test.id}`} kind="danger" onPress={onDelete} />
    </Screen>
  );
}

function Stat({ label, value, foot, chip }: { label: string; value: string; foot: string; chip?: "ok" | "err" }) {
  return (
    <Card style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Text style={st.muted}>{label}</Text>
      <Text style={st.bigValue}>{value}</Text>
      <Text style={st.muted}>{foot}</Text>
      {chip && <Chip kind={chip}>{chip === "ok" ? "On target" : "Above target"}</Chip>}
    </Card>
  );
}

function RiskChart({ curve, threshold }: { curve: A.CurvePoint[]; threshold: number }) {
  const W = 320, H = 170, L = 8, R_ = 8, T = 8, B = 8;
  const x = (t: number) => L + ((t - 0.5) / 0.48) * (W - L - R_);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const line = (get: (p: A.CurvePoint) => number | null) => curve.filter((p) => get(p) != null).map((p) => `${x(p.threshold).toFixed(1)},${y(get(p)!).toFixed(1)}`).join(" ");
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={L} x2={W - R_} y1={y(A.WRONG_SHOWN_TARGET)} y2={y(A.WRONG_SHOWN_TARGET)} stroke={C.err} strokeDasharray="4 4" />
      <Line x1={x(threshold)} x2={x(threshold)} y1={T} y2={H - B} stroke={C.ok} strokeDasharray="2 4" />
      <Polyline points={line((p) => p.precision_shown)} fill="none" stroke={C.primary} strokeWidth={2.5} />
      <Polyline points={line((p) => p.coverage)} fill="none" stroke={C.teal} strokeWidth={2.5} strokeDasharray="6 5" />
      <Polyline points={line((p) => p.wrong_shown_rate)} fill="none" stroke={C.err} strokeWidth={2.5} />
    </Svg>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  h3: { fontSize: 18, fontWeight: "700", color: C.text },
  muted: { fontSize: 14, color: C.text3, lineHeight: 20 },
  combo: { fontSize: 15, fontWeight: "600", color: C.primary },
  big: { fontSize: 30, fontWeight: "700", color: C.text },
  bigValue: { fontSize: 32, fontWeight: "700", color: C.text, letterSpacing: -0.5 },
  mono: { fontSize: 15, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, flexWrap: "wrap" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  signRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 4 },
  signKey: { width: 56, fontSize: 16, fontWeight: "700", color: C.text },
});
