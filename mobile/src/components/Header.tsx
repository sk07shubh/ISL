import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, S } from "../theme";
import { Chip } from "./ui";

/** Top bar: app name, server status, and the settings button. */
export function Header({ onSettings, online }: { onSettings?: () => void; online?: boolean }) {
  return (
    <View style={st.bar}>
      <View style={st.brand}>
        <View style={st.logo}><Text style={st.logoText}>✋</Text></View>
        <Text style={st.name}>ISL Interpreter</Text>
      </View>
      <View style={st.right}>
        {online !== undefined && <Chip kind={online ? "ok" : "err"}>{online ? "Online" : "Offline"}</Chip>}
        {onSettings && (
          <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel="Settings" style={st.gear}>
            <Text style={st.gearText}>⚙</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingBottom: S.xs },
  brand: { flexDirection: "row", alignItems: "center", gap: S.sm, flexShrink: 1 },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 18 },
  name: { fontSize: 18, fontWeight: "700", color: C.text, letterSpacing: -0.3 },
  right: { flexDirection: "row", alignItems: "center", gap: S.sm },
  gear: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  gearText: { fontSize: 20, color: C.text },
});
