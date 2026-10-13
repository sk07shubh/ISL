import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LangCode } from "./speech";

export interface Settings { deviceId: string; mirror: boolean; showSkeleton: boolean; speakEach: boolean; autoSpace: boolean; lang: LangCode; voiceURI: string }
const DEFAULTS: Settings = { deviceId: "", mirror: true, showSkeleton: true, speakEach: true, autoSpace: false, lang: "en", voiceURI: "" };
const KEY = "isl.settings.v4";
const Ctx = createContext<{ s: Settings; set: (p: Partial<Settings>) => void; open: boolean; setOpen: (b: boolean) => void }>(null as never);
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; } });
  const [open, setOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage may be blocked */ } }, [s]);
  return <Ctx.Provider value={{ s, set: (p) => setS((x) => ({ ...x, ...p })), open, setOpen }}>{children}</Ctx.Provider>;
}
