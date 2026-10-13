import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Bar, Btn, Card, Chip, Ring, Segmented } from "../components/ui";
import { Screen } from "./InterpreterScreen";
import { C, S, R } from "../theme";
import { useModel } from "../lib/useModel";
import { Recognizer } from "../lib/recognizer";
import { handTracker } from "../tracking/handTracker";
import { saveTest, type Attempt, type Mode, type TestMeta } from "../lib/api";
import type { GateOutput, VocabEntry } from "../lib/types";
import { Header } from "../components/Header";

const TIMEOUT_MS = 8000;
const MODES: [Mode, string][] = [["all", "Everything"], ["alphabet", "Letters"], ["digit", "Digits"], ["phrase", "Phrases"]];
const KIND: Record<Mode, VocabEntry["kind"] | null> = { all: null, alphabet: "letter", digit: "digit", phrase: "word" };
const LIGHT = [["bright", "Bright"], ["dim", "Dim"], ["mixed", "Mixed"]] as [string, string][];
const DIST = [["near", "Near"], ["medium", "Medium"], ["far", "Far"]] as [string, string][];

type Phase = "setup" | "run" | "done";

/** A guided test: show each sign when asked. Records what the app read, or that it stayed unsure, and how long it took. */
export function LiveTestScreen() {
  const { info, signs, error } = useModel();
  const [name, setName] = useState("");
  const [testMode, setTestMode] = useState<Mode>("all");
  const [light, setLight] = useState<string | null>(null);
  const [dist, setDist] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gate, setGate] = useState<GateOutput | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const recognizer = useRef<Recognizer | null>(null);
  const startedAt = useRef(0), lock = useRef(false), meta = useRef<TestMeta>({ tester: "anon" });
  const cur = useRef({ phase, queue, idx, attempts }); cur.current = { phase, queue, idx, attempts };

  const byKey = useMemo(() => new Map(signs.map((v) => [v.key, v])), [signs]);
  const pool = signs.filter((v) => v.active && (KIND[testMode] === null || v.kind === KIND[testMode]));
  const target = phase === "run" ? queue[idx] : null;
  const v = target ? byKey.get(target) : null;

  useEffect(() => { if (info) recognizer.current = new Recognizer(info, testMode); }, [info]);
  useEffect(() => { recognizer.current?.setMode(testMode); }, [testMode]);

  const advance = useCallback((a: Attempt) => {
    if (lock.current) return; lock.current = true;
    const ok = a.predicted === a.target;
    setAttempts((x) => [...x, a]);
    setFeedback(a.predicted === null ? "Stayed unsure (no wrong guess)" : ok ? "Correct" : `Read as ${byKey.get(a.predicted)?.short ?? a.predicted}`);
    setTimeout(() => {
      setFeedback(null); lock.current = false;
      const c = cur.current;
      if (c.idx + 1 >= c.queue.length) setPhase("done"); else { setIdx(c.idx + 1); startedAt.current = Date.now(); }
    }, 1000);
  }, [byKey]);

  const measure = (g: GateOutput | null, predicted: string | null, t: string): Attempt => ({
    target: t, predicted, confidence: predicted ? g?.confidence ?? null : null, margin: predicted ? g?.margin ?? null : null,
    top_label: g?.top?.[0]?.label ?? null, top_conf: g?.top?.[0]?.prob ?? null, elapsed_ms: Date.now() - startedAt.current,
    hand_size: null, brightness: null,
  });

  // Decisions: a committed sign, or the timeout.
  useEffect(() => {
    if (phase !== "run") return;
    const c = cur.current;
    if (gate?.committed && !lock.current && c.queue[c.idx]) advance(measure(gate, gate.committed, c.queue[c.idx]));
  }, [gate?.committed]);

  useEffect(() => {
    if (phase !== "run") return;
    startedAt.current = Date.now();
    const iv = setInterval(() => {
      const e = Date.now() - startedAt.current; setElapsed(e);
      const c = cur.current;
      if (e > TIMEOUT_MS && !lock.current && c.queue[c.idx]) advance(measure(null, null, c.queue[c.idx]));
    }, 150);
    return () => clearInterval(iv);
  }, [phase, idx]);

  useEffect(() => {
    if (phase !== "done" || !cur.current.attempts.length) return;
    setSaved("saving");
    saveTest(meta.current, cur.current.attempts).then(() => setSaved("ok")).catch(() => setSaved("err"));
  }, [phase]);

  // Frames from the tracker feed the recogniser while a test runs.
  useEffect(() => {
    if (!handTracker || phase !== "run") return;
    const stop = handTracker.start(async (f) => {
      const rec = recognizer.current; if (!rec) return;
      const out = await rec.push(f.hands, f.aspect, Date.now());
      setGate(out.gate);
    });
    return stop;
  }, [phase]);

  const start = () => {
    meta.current = { tester: name.trim() || "anon", lighting: light as TestMeta["lighting"], distance: dist as TestMeta["distance"] };
    setQueue(pool.map((p) => p.key).sort(() => Math.random() - 0.5));
    setIdx(0); setAttempts([]); setSaved("idle"); lock.current = false; setGate(null); setPhase("run");
  };

  const correct = attempts.filter((a) => a.predicted === a.target).length;
  const unsure = attempts.filter((a) => a.predicted === null).length;
  const wrong = attempts.length - correct - unsure;
  const canStart = !!info && !!handTracker && pool.length > 0 && (!name.trim() || /^[A-Za-z0-9_ -]{1,16}$/.test(name.trim()));

  if (error) return <Screen><Header /><Card><Text style={st.title}>Cannot reach the interpreter</Text><Text style={st.muted}>{error}</Text></Card></Screen>;

  return (
    <Screen>
      <Header online={!!info} />
      <Text style={st.title}>Live test</Text>
      <Text style={st.muted}>Show each sign when the app asks for it. It records what the interpreter reads, or that it stayed unsure, and how long it took.</Text>

      {phase === "setup" && (<>
        <Card>
          <Text style={st.h3}>Start a test</Text>
          <Text style={st.label}>Your name or code (optional)</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Asha" placeholderTextColor={C.text3} maxLength={16} style={st.input} accessibilityLabel="Your name or code" />
          <Text style={st.label}>What to test</Text>
          <Segmented label="What to test" value={testMode} options={MODES} onChange={setTestMode} />
          <Text style={st.muted}>{pool.length} sign{pool.length === 1 ? "" : "s"} · each asked once, in random order</Text>
          <Text style={st.label}>Lighting (optional)</Text>
          <Segmented label="Lighting" value={(light ?? "none") as "none"} options={[["none", "Not noted"], ...LIGHT] as [string, string][]} onChange={(x) => setLight(x === "none" ? null : x)} />
          <Text style={st.label}>Distance (optional)</Text>
          <Segmented label="Distance" value={(dist ?? "none") as "none"} options={[["none", "Not noted"], ...DIST] as [string, string][]} onChange={(x) => setDist(x === "none" ? null : x)} />
        </Card>
        {!handTracker && <Card><Text style={st.muted}>Recognition is not available in this build yet, so a test cannot start. The on-phone hand tracking is the next build step.</Text></Card>}
        <Btn label={!info ? "Connecting…" : `Start (${pool.length} signs)`} kind="primary" onPress={start} disabled={!canStart} />
      </>)}

      {phase === "run" && v && (<>
        <Card>
          <View style={st.row}><Text style={st.muted}>Show this sign</Text><Chip kind="load">{idx + 1} of {queue.length}</Chip></View>
          <Text style={[st.prompt, v.kind === "word" && st.promptWord]} numberOfLines={2}>{v.kind === "word" ? v.name : v.short}</Text>
          <View style={st.row}>
            <Ring value={Math.min(1, elapsed / TIMEOUT_MS)} size={84} stroke={8}><Text style={st.ringNum}>{Math.max(0, Math.ceil((TIMEOUT_MS - elapsed) / 1000))}s</Text></Ring>
            <View style={{ flex: 1, gap: S.sm }}>
              <View style={st.row}><Text style={st.muted}>Reads as</Text><Text style={st.mono}>{gate?.state === "recognised" && gate.label ? (byKey.get(gate.label)?.short ?? gate.label) : "…"}</Text></View>
              <Bar value={gate?.state === "recognised" ? gate.holdProgress : 0} color={C.ok} />
            </View>
          </View>
          {feedback && <Text style={st.feedback}>{feedback}</Text>}
        </Card>
        <View style={st.btnRow}>
          <Btn label="Skip" onPress={() => target && advance(measure(null, null, target))} />
          <Btn label="Stop" kind="danger" onPress={() => setPhase("setup")} />
        </View>
        <Text style={st.muted}>{correct} correct · {wrong} wrong · {unsure} unsure so far</Text>
      </>)}

      {phase === "done" && (<>
        <Card>
          <Text style={st.title}>Test finished</Text>
          <View style={st.stats}>
            <Stat value={`${attempts.length ? Math.round((correct / attempts.length) * 100) : 0}%`} label="correct" />
            <Stat value={String(wrong)} label="wrong shown" />
            <Stat value={String(unsure)} label="unsure" />
          </View>
          <Text style={st.muted}>{saved === "saving" ? "Saving…" : saved === "ok" ? "Saved. See Model & results." : saved === "err" ? "Could not save. Check the connection." : ""}</Text>
        </Card>
        <Btn label="Run another test" kind="primary" onPress={() => setPhase("setup")} />
      </>)}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={st.stat}><Text style={st.statValue}>{value}</Text><Text style={st.muted}>{label}</Text></View>;
}

const st = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  h3: { fontSize: 18, fontWeight: "700", color: C.text },
  label: { fontSize: 14, fontWeight: "600", color: C.text2, marginTop: S.sm },
  muted: { fontSize: 14, color: C.text3, lineHeight: 20 },
  mono: { fontSize: 16, fontWeight: "700", color: C.text },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  input: { height: 46, borderWidth: 1, borderColor: C.line2, borderRadius: R.btn, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface },
  prompt: { fontSize: 120, lineHeight: 130, fontWeight: "700", color: C.primary, textAlign: "center", alignSelf: "stretch" },
  promptWord: { fontSize: 40, lineHeight: 48 },
  ringNum: { fontSize: 16, fontWeight: "700", color: C.text },
  feedback: { fontSize: 16, fontWeight: "700", color: C.okTx, backgroundColor: C.okBg, padding: S.sm, borderRadius: R.btn, textAlign: "center" },
  btnRow: { flexDirection: "row", gap: S.sm },
  stats: { flexDirection: "row", gap: S.sm },
  stat: { flex: 1, backgroundColor: C.surface2, borderRadius: R.btn, padding: S.md, alignItems: "center" },
  statValue: { fontSize: 26, fontWeight: "700", color: C.text },
  ringText: {},
});
