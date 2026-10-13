export function listVoices(): SpeechSynthesisVoice[] {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}
export const LANGS = [
  { code: "en", tag: "en-IN", label: "English" },
  { code: "hi", tag: "hi-IN", label: "हिन्दी (Hindi)" },
  { code: "mr", tag: "mr-IN", label: "मराठी (Marathi)" },
] as const;
export type LangCode = (typeof LANGS)[number]["code"];

/** Speak now, replacing anything still being said, so the newest sign is never queued behind an old one. */
export function speak(text: string, lang: LangCode, voiceURI?: string, rate = 0.9) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.trim());
  const tag = LANGS.find((l) => l.code === lang)!.tag;
  u.lang = tag;
  u.rate = rate;
  const v = listVoices();
  const chosen = v.find((x) => x.voiceURI === voiceURI && x.lang.startsWith(lang)) ?? v.find((x) => x.lang === tag) ?? v.find((x) => x.lang.startsWith(lang));
  if (chosen) u.voice = chosen;
  synth.speak(u);
}
