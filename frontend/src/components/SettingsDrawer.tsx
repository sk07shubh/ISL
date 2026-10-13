import { useEffect, useState } from "react";
import { Icon, Toggle } from "./ui";
import { useSettings } from "../lib/settings";
import { LANGS, listVoices, speak, type LangCode } from "../lib/speech";

export function SettingsDrawer() {
  const { s, set, open, setOpen } = useSettings();
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices?.enumerateDevices().then((d) => setCams(d.filter((x) => x.kind === "videoinput"))).catch(() => {});
    const load = () => setVoices(listVoices());
    load(); window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => { window.speechSynthesis?.removeEventListener?.("voiceschanged", load); window.removeEventListener("keydown", esc); };
  }, [open]);

  if (!open) return null;
  const tag = LANGS.find((l) => l.code === s.lang)!.tag;
  const vs = voices.filter((v) => v.lang.toLowerCase().startsWith(s.lang));
  return (
    <div className="drawer-wrap">
      <div className="scrim" onClick={() => setOpen(false)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <header><h2>Settings</h2><button className="icon-btn" aria-label="Close settings" onClick={() => setOpen(false)}><Icon name="x" /></button></header>

        <label className="field"><span><Icon name="camera" size={16} /> Camera</span>
          <select value={s.deviceId} onChange={(e) => set({ deviceId: e.target.value })}>
            <option value="">Default camera</option>
            {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
          </select>
        </label>
        <Toggle on={s.mirror} onChange={(mirror) => set({ mirror })} label="Mirror video" hint="Like a mirror, so left and right feel natural. Does not change recognition." />
        <Toggle on={s.showSkeleton} onChange={(showSkeleton) => set({ showSkeleton })} label="Show skeleton overlay" hint="The 21 tracked points per hand." />
        <Toggle on={s.speakEach} onChange={(speakEach) => set({ speakEach })} label="Real-time speech" hint="Says each recognised letter once, as it is added. Words are read whole." />
        <Toggle on={s.autoSpace} onChange={(autoSpace) => set({ autoSpace })} label="Space after every letter" hint="Words always get a space after them. Turn this on to also space out single letters." />

        <label className="field"><span><Icon name="type" size={16} /> Language for names and speech</span>
          <select value={s.lang} onChange={(e) => set({ lang: e.target.value as LangCode, voiceURI: "" })}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="field"><span><Icon name="speaker" size={16} /> Voice</span>
          <select value={s.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })}>
            <option value="">Automatic ({tag})</option>
            {vs.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select>
          {vs.length === 0 && <small className="muted">No {tag} voice is installed on this device; the browser default will be used.</small>}
        </label>
        <button className="btn btn-secondary" onClick={() => speak(s.lang === "en" ? "ay bee see" : s.lang === "hi" ? "नमस्ते" : "नमस्कार", s.lang, s.voiceURI)}><Icon name="speaker" size={18} /> Test voice</button>
        <p className="muted small">Letters use fixed English letter sounds (ay, bee, see). Words are read as whole words.</p>
      </aside>
    </div>
  );
}
