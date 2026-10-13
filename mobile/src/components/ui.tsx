import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { C, R, S } from "../theme";

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export type ChipKind = "ok" | "warn" | "idle" | "load" | "err";
const CHIP: Record<ChipKind, { bg: string; tx: string; bd: string; dot: string }> = {
  ok: { bg: C.okBg, tx: C.okTx, bd: C.okBd, dot: C.ok }, warn: { bg: C.warnBg, tx: C.warnTx, bd: C.warnBd, dot: C.warn },
  idle: { bg: C.idleBg, tx: C.idleTx, bd: C.idleBd, dot: C.text3 }, load: { bg: C.loadBg, tx: C.loadTx, bd: C.loadBd, dot: "#0284c7" },
  err: { bg: C.errBg, tx: C.errTx, bd: C.errBd, dot: "#dc2626" },
};
export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  const c = CHIP[kind];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text style={[styles.chipText, { color: c.tx }]}>{children}</Text>
    </View>
  );
}

export function Bar({ value, color = C.primary }: { value: number | null | undefined; color?: string }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={[styles.barFill, { width: `${v * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Ring({ value, size = 96, stroke = 9, color = C.primary, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.surface3} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - v)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      {children}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[styles.segBtn, on && styles.segOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({ label, onPress, kind = "secondary", disabled, icon }: { label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; icon?: string }) {
  const bg = kind === "primary" ? C.primary : kind === "danger" ? C.danger : kind === "ghost" ? "transparent" : C.surface;
  const tx = kind === "primary" ? "#fff" : kind === "danger" ? C.errTx : kind === "ghost" ? C.errTx : C.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, borderColor: kind === "secondary" ? C.line : "transparent", opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}>
      {icon ? <Text style={{ color: tx, fontSize: 16 }}>{icon}  </Text> : null}
      <Text style={[styles.btnText, { color: tx }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export const pct = (x: number | null | undefined, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1, borderColor: C.line, padding: S.lg, gap: S.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.chip, borderWidth: 1, alignSelf: "flex-start" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: "600" },
  bar: { height: 10, borderRadius: 999, backgroundColor: C.surface3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  seg: { flexDirection: "row", backgroundColor: C.surface2, borderRadius: R.btn, padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 8 },
  segOn: { backgroundColor: C.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 14, fontWeight: "600", color: C.text2 },
  segTextOn: { color: C.primary },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 48, paddingHorizontal: 14, borderRadius: R.btn, borderWidth: 1, flexGrow: 1 },
  btnText: { fontSize: 15, fontWeight: "600" },
});
