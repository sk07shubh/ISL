/**
 * Sentence editor rules, kept pure so they can be unit-tested.
 *
 * Spelling: every letter is spoken as a fixed English letter name ("A" -> "ay", "B" -> "bee"), so the same letter
 * always sounds the same. Words (greetings, everyday words) will be spoken as whole words once they exist; their
 * entry carries a `speak` text for that.
 */
export const LETTER_SOUND: Record<string, string> = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "ef", G: "jee", H: "aitch", I: "eye", J: "jay", K: "kay", L: "el", M: "em",
  N: "en", O: "oh", P: "pee", Q: "cue", R: "ar", S: "ess", T: "tee", U: "you", V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee",
};
export const DIGIT_SOUND = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export interface SpeakableSign { key: string; kind?: "letter" | "digit" | "word"; speak?: string }

/** The spoken form of one recognised sign. */
export function spellSign(s: SpeakableSign): string {
  if (s.kind === "word") return (s.speak || s.key).toLowerCase();
  if (s.kind === "digit" || /^[0-9]$/.test(s.key)) return DIGIT_SOUND[Number(s.key)] ?? s.key;
  return (LETTER_SOUND[s.key.toUpperCase()] ?? s.key).toLowerCase();
}

/**
 * Speech for the whole sentence: each word is read as a WORD, once, in lowercase.
 * Upper-case text makes many speech engines read letters one by one ("H-E-L-L-O"), so we lowercase it first.
 */
export function speakableSentence(text: string): string {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

export interface Edit { text: string; caret: number }

/** Insert at the caret (or at the end if the caret is unknown). */
export function insertAt(text: string, caret: number | null, ins: string): Edit {
  const p = Math.max(0, Math.min(caret ?? text.length, text.length));
  return { text: text.slice(0, p) + ins + text.slice(p), caret: p + ins.length };
}

/** Delete the character before the caret, like Backspace in a normal text editor. */
export function deleteBefore(text: string, caret: number | null): Edit {
  const p = Math.max(0, Math.min(caret ?? text.length, text.length));
  if (p === 0) return { text, caret: 0 };
  return { text: text.slice(0, p - 1) + text.slice(p), caret: p - 1 };
}

/** Delete the character after the caret, like the Delete key. */
export function deleteAfter(text: string, caret: number | null): Edit {
  const p = Math.max(0, Math.min(caret ?? text.length, text.length));
  return { text: text.slice(0, p) + text.slice(p + 1), caret: p };
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
