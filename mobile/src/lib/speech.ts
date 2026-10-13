import * as Speech from "expo-speech";

/** Speak now, replacing anything still being said. Words are read in lower case so they are not spelled out. */
export function speak(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return;
  Speech.stop();
  Speech.speak(t, { language: "en-IN", rate: 0.9 });
}
