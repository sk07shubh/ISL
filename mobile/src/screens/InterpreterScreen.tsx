import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { HandCamera, type HandFrame } from "../tracking/HandCamera";
import { useIsFocused } from "@react-navigation/native";
import { useLandscape } from "../tracking/orientation";
import { Bar, Btn, Card, Chip, Ring, Segmented, pct } from "../components/ui";
import { C, S, R } from "../theme";
import { useModel } from "../lib/useModel";
import { useSettings } from "../state";
import { useRecognition } from "../lib/useRecognition";
import { spellSign, speakableSentence, insertAt, deleteBefore, wordCount } from "../lib/sentence";
import { speak } from "../lib/speech";
import { reasonText } from "../lib/gate";
import type { Mode } from "../lib/api";
import type { GateOutput, VocabEntry } from "../lib/types";
import { ApiError } from "../lib/api";
import { Header } from "../components/Header";

const MODES: [Mode, string][] = [["all", "All"], ["alphabet", "Letters"], ["digit", "Digits"], ["phrase", "Phrases"]];
const KIND: Record<Mode, VocabEntry["kind"] | null> = { all: null, alphabet: "letter", digit: "digit", phrase: "word" };

// Add the chart crops under mobile/assets/isl-sign-illustrations/{letters,digits,phrases}/.
// The source is a URI so the app keeps working with text fallbacks until the PNGs are added.
function signImageUri(v: VocabEntry) {
  const category = v.kind === "letter" ? "letters" : v.kind === "digit" ? "digits" : "phrases";
  const label = v.kind === "word" ? v.key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : v.short.toUpperCase();
  return `isl-sign-illustrations/${category}/${label}.png`;
}

export function InterpreterScreen() {
  const { s, set } = useSettings();
  const { info, signs, error, retry } = useModel();
  const [mode, setMode] = useState<Mode>("all");
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [signsOpen, setSignsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { width, height: screenH } = useWindowDimensions();
  const camH = Math.min(screenH * 0.55, 360);
  const camW = Math.min(camH * 4 / 3, width - S.lg * 2);

  const byKey = useMemo(() => new Map(signs.map((v) => [v.key, v])), [signs]);
  const inMode = signs.filter((v) => KIND[mode] === null || v.kind === KIND[mode]);

  // A confirmed sign goes into the sentence and is spoken once: one word, or one letter.
  const commit = (label: string) => {
    const e = byKey.get(label);
    const kind = e?.kind ?? "letter";
    const shown = kind === "word" ? (e?.speak || e?.short || label) : (e?.short ?? label);
    const addSpace = kind === "word" || s.autoSpace;
    setText((cur) => insertAt(cur, null, shown + (addSpace ? " " : "")).text);
    if (s.speakEach) speak(spellSign({ key: label, kind, speak: e?.speak ?? undefined }));
  };

  const focused = useIsFocused();
  useLandscape();
  const { gate, probs, fps, onFrame } = useRecognition(mode, (label) => commit(label));
  const status = "Recognising on this phone";

  const doSpeak = () => speak(speakableSentence(text));
  const doSpace = () => setText(insertAt(text, null, " ").text);
  const doBack = () => setText(deleteBefore(text, null).text);
  const doClear = () => setText("");

  const live = gate?.state === "recognised" && gate.label ? gate.label : null;
  const holdSec = gate ? (gate.holdProgress * gate.holdMs) / 1000 : 0;
  const hint = gate?.state === "uncertain" ? reasonText(gate.reason)
    : gate?.state === "recognised" ? (gate.locked && gate.holdProgress >= 1 ? "Added. Change or lower your hand to sign again" : "Keep holding steady")
    : "Show your hand to the camera";

  if (error) return <Screen><Header /><Card><Text style={st.title}>Cannot reach the interpreter</Text><Text style={st.muted}>{error}</Text><Btn label="Try again" onPress={retry} kind="primary" /></Card></Screen>;

  return (
    <Screen>
      <Header onSettings={() => setSettingsOpen(true)} online={!!info} />

      <Segmented label="What to recognise" value={mode} options={MODES} onChange={setMode} />

      {/* Camera */}
      <Card style={{ padding: S.sm }}>
        <View style={[st.camBox, { width: camW, height: camH, alignSelf: "center" }]}>
          {focused && <HandCamera active={focused} onFrame={onFrame} style={StyleSheet.absoluteFill} />}
          <View style={st.camChip}>
            {gate?.state === "recognised" ? <Chip kind="ok">Recognised</Chip> : gate?.state === "uncertain" ? <Chip kind="warn">Uncertain</Chip> : <Chip kind="idle">No hand</Chip>}
          </View>
          <View style={st.camFps}><Text style={st.camFpsText}>{fps} fps</Text></View>
        </View>
        <Text style={[st.muted, { textAlign: "center" }]}>{status}</Text>
      </Card>

      {/* Recognised sign */}
      <Card>
        <View style={st.row}>
          <Text style={st.eyebrow}>Recognised sign</Text>
          {gate?.locked && live && gate.holdProgress >= 1 ? <Chip kind="ok">Added</Chip> : live ? <Chip kind="load">Holding</Chip> : null}
        </View>
        <View style={st.signRow}>
          <View style={{ flex: 1 }}>
            <Text style={live ? st.word : st.wordPlaceholder} numberOfLines={2} adjustsFontSizeToFit>
              {live ? (byKey.get(live)?.short ?? live) : gate?.state === "uncertain" ? "Uncertain" : "No hand"}
            </Text>
          </View>
          <Ring value={live ? gate!.holdProgress : 0} size={92} color={gate?.locked && live ? C.ok : C.primary}>
            <Text style={st.ringNum}>{live ? holdSec.toFixed(1) : "0.0"}s</Text>
            <Text style={st.ringSub}>of {gate ? (gate.holdMs / 1000).toFixed(1) : "0.6"}s</Text>
          </Ring>
        </View>
        <View style={st.row}><Text style={st.muted}>Confidence</Text><Text style={st.mono}>{live ? pct(gate!.confidence, 1) : "—"}</Text></View>
        <Bar value={live ? gate!.confidence : 0} color={live ? C.ok : C.primary} />
        <Text style={[st.hint, gate?.state === "uncertain" && { color: C.warnTx }]}>{hint}</Text>
      </Card>

      {/* Top 3 */}
      <Card>
        <View style={st.row}><Text style={st.h3}>Top 3 predictions</Text><Text style={st.muted}>averaged over {info?.gate.smooth ?? 8} frames</Text></View>
        {[0, 1, 2].map((i) => {
          const top = probs && info ? topN(probs, info.labels, 3)[i] : null;
          return (
            <View key={i} style={st.t3}>
              <Text style={st.rank}>{i + 1}</Text>
              <Text style={[st.t3Name, !top && st.muted]} numberOfLines={1}>{top ? (byKey.get(top.label)?.short ?? top.label) : "—"}</Text>
              <View style={{ flex: 1 }}><Bar value={top?.prob ?? 0} color={C.teal} /></View>
              <Text style={st.t3Pct}>{top ? pct(top.prob, 1) : ""}</Text>
            </View>
          );
        })}
      </Card>

      {/* Sentence */}
      <Card>
        <View style={st.row}><Text style={st.h3}>Sentence</Text><Text style={st.muted}>{wordCount(text)} {wordCount(text) === 1 ? "word" : "words"}</Text></View>
        <TextInput value={text} editable={false} multiline style={st.sentence} placeholder="Signs you hold steady appear here."
          placeholderTextColor={C.text3} accessibilityLabel="Sentence, filled in by hand recognition" />
        <View style={st.btnGrid}>
          <Btn label="Speak" kind="primary" onPress={doSpeak} disabled={!text.trim()} />
          <Btn label="Space" onPress={doSpace} />
          <Btn label="Delete" onPress={doBack} disabled={!text.length} />
          <Btn label="Clear" kind="danger" onPress={doClear} disabled={!text.length} />
        </View>
      </Card>

      <Btn label={`Signs I know (${inMode.length})`} onPress={() => setSignsOpen(true)} />

      {/* Signs I know */}
      <Modal visible={signsOpen} animationType="slide" onRequestClose={() => setSignsOpen(false)}>
        <Screen>
          <View style={st.row}><Text style={st.title}>Signs I know</Text><Btn label="Done" kind="primary" onPress={() => setSignsOpen(false)} /></View>
          <Segmented label="Filter" value={mode} options={MODES} onChange={setMode} />
          <View style={st.grid}>
            {inMode.map((v) => {
              const palette = v.kind === "letter"
                ? { bg: "#e6f3ff", ink: "#234f88", accent: "#9bcfff" }
                : v.kind === "digit"
                  ? { bg: "#e7f7eb", ink: "#216a4d", accent: "#a4dfba" }
                  : { bg: "#f0e9ff", ink: "#5d438f", accent: "#cdb9ff" };
              return (
                <Pressable key={v.key} onPress={() => setTarget(target === v.key ? null : v.key)} accessibilityRole="button"
                  style={[
                    st.tile,
                    { backgroundColor: palette.bg, borderColor: palette.accent, borderRadius: 16, minHeight: 112, aspectRatio: 0.88, shadowColor: "#304b70", shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
                    live === v.key && st.tileLive,
                    target === v.key && st.tileTarget
                  ]}>
                  <View style={[st.tileGlyphWrap, { borderColor: palette.accent, width: "100%", height: 68, borderRadius: 12, overflow: "hidden" }]}>
                    <Image
                      source={{ uri: signImageUri(v) }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="contain"
                      accessibilityLabel={`ISL hand sign for ${v.name}`}
                    />
                    <Text style={[st.tileGlyph, { color: palette.ink }, v.kind === "word" && st.tileWord]} numberOfLines={2}>{v.short}</Text>
                  </View>
                  <Text style={[st.tileName, { color: palette.ink }]} numberOfLines={2}>{v.name}</Text>
                  <Text style={[st.tileSub, { color: palette.ink }]} numberOfLines={1}>{v.category}</Text>
                </Pressable>
              );
            })}
          </View>
          {target && <Text style={st.muted}>Practising: {byKey.get(target)?.name}. Show it to the camera.</Text>}
        </Screen>
      </Modal>

      {/* Settings */}
      <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={st.scrim} onPress={() => setSettingsOpen(false)} />
        <View style={st.sheet}>
          <View style={st.row}><Text style={st.title}>Settings</Text><Btn label="Close" onPress={() => setSettingsOpen(false)} /></View>
          <ToggleRow label="Speak each sign" hint="Says each recognised letter once, as it is added." value={s.speakEach} onChange={(v) => set({ speakEach: v })} />
          <ToggleRow label="Space after every letter" hint="Words always get a space. This adds one after letters too." value={s.autoSpace} onChange={(v) => set({ autoSpace: v })} />
          <Text style={st.muted}>Server: {info ? "connected" : "not connected"} · {info ? `${info.labels.length} signs` : ""}</Text>
        </View>
      </Modal>
    </Screen>
  );
}

function topN(probs: number[], labels: string[], n: number) {
  return probs.map((p, i) => ({ label: labels[i], prob: p })).filter((x) => x.prob > 0).sort((a, b) => b.prob - a.prob).slice(0, n);
}

export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={st.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.toggle}>
      <View style={{ flex: 1 }}><Text style={st.toggleLabel}>{label}</Text><Text style={st.muted}>{hint}</Text></View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.primary, false: C.line2 }} />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { padding: S.lg, gap: S.md, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  title: { fontSize: 22, fontWeight: "700", color: C.text },
  h3: { fontSize: 17, fontWeight: "700", color: C.text },
  eyebrow: { fontSize: 15, fontWeight: "600", color: C.text2 },
  muted: { fontSize: 14, color: C.text3, lineHeight: 20 },
  mono: { fontSize: 15, fontWeight: "700", color: C.text, fontVariant: ["tabular-nums"] },
  camBox: { backgroundColor: "#0f172a", borderRadius: R.card, overflow: "hidden" },
  camFps: { position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(15,23,42,0.7)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  camFpsText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  camChip: { position: "absolute", top: 12, left: 12 },
  signRow: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 100 },
  word: { fontSize: 64, lineHeight: 70, fontWeight: "700", color: C.text, letterSpacing: -1 },
  wordPlaceholder: { fontSize: 32, lineHeight: 40, fontWeight: "700", color: C.line2 },
  ringNum: { fontSize: 17, fontWeight: "700", color: C.text },
  ringSub: { fontSize: 11, color: C.text3 },
  hint: { fontSize: 15, color: C.text2 },
  t3: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 6 },
  rank: { width: 22, textAlign: "center", fontSize: 12, fontWeight: "700", backgroundColor: C.surface3, borderRadius: 6, overflow: "hidden", paddingVertical: 2, color: C.text },
  t3Name: { width: 70, fontSize: 16, fontWeight: "700", color: C.text },
  t3Pct: { width: 56, textAlign: "right", fontSize: 13, color: C.text2, fontVariant: ["tabular-nums"] },
  sentence: { minHeight: 110, padding: S.md, backgroundColor: C.surface2, borderRadius: R.btn, borderWidth: 1, borderColor: C.surface3, fontSize: 26, lineHeight: 34, fontWeight: "700", color: C.text, textAlignVertical: "top" },
  btnGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  tile: { width: "31%", minHeight: 112, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 8 },
  tileLive: { borderColor: C.ok, borderWidth: 2, backgroundColor: C.okBg },
  tileTarget: { borderColor: C.primary, borderWidth: 2 },
  tileGlyphWrap: { width: 52, height: 52, borderRadius: 17, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center", marginBottom: 7 },
  tileGlyph: { fontSize: 29, fontWeight: "800", color: C.primary },
  tileWord: { fontSize: 15, lineHeight: 17, textAlign: "center", color: C.text },
  tileName: { fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  tileSub: { fontSize: 10, color: C.text3, marginTop: 3, opacity: 0.72, textAlign: "center" },
  scrim: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: C.surface, padding: S.xl, gap: S.md, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  toggle: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.line },
  toggleLabel: { fontSize: 16, fontWeight: "600", color: C.text },
});
