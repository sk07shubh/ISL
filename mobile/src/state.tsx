import { createContext, useContext, useState, type ReactNode } from "react";

export interface Settings { speakEach: boolean; autoSpace: boolean }
const Ctx = createContext<{ s: Settings; set: (p: Partial<Settings>) => void }>(null as never);
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>({ speakEach: true, autoSpace: false });
  return <Ctx.Provider value={{ s, set: (p) => setS((x) => ({ ...x, ...p })) }}>{children}</Ctx.Provider>;
}
