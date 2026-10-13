import { describe, it, expect } from "vitest";
import { spellSign, spellOut, insertAt, deleteBefore, deleteAfter, wordCount } from "./sentence";

describe("spelling is direct and consistent", () => {
  it("letters use one fixed sound each, no 'letter' prefix", () => {
    expect(spellSign({ key: "A", kind: "letter" })).toBe("ay");
    expect(spellSign({ key: "B", kind: "letter" })).toBe("bee");
    expect(spellSign({ key: "b", kind: "letter" })).toBe("bee");       // lower case gives the same sound
    expect(spellSign({ key: "W", kind: "letter" })).toBe("double you");
  });
  it("digits are spoken as numbers", () => {
    expect(spellSign({ key: "7", kind: "digit" })).toBe("seven");
  });
  it("words are spoken as words", () => {
    expect(spellSign({ key: "hello", kind: "word", speak: "hello" })).toBe("hello");
  });
  it("spellOut spells every letter and pauses between words", () => {
    expect(spellOut("hi there")).toBe("aitch eye, tee aitch ee ar ee");
    expect(spellOut("  ab  ")).toBe("ay bee");
    expect(spellOut("")).toBe("");
  });
  it("spellOut includes digits and ignores punctuation", () => {
    expect(spellOut("A1!")).toBe("ay one");
  });
});

describe("editing like a normal text editor", () => {
  it("inserts at the caret", () => {
    expect(insertAt("hllo", 1, "e")).toEqual({ text: "hello", caret: 2 });
  });
  it("appends when the caret is unknown", () => {
    expect(insertAt("hel", null, "lo")).toEqual({ text: "hello", caret: 5 });
  });
  it("Backspace deletes one character, not a whole word", () => {
    expect(deleteBefore("hello", 5)).toEqual({ text: "hell", caret: 4 });
    expect(deleteBefore("hello", 2)).toEqual({ text: "hllo", caret: 1 });
    expect(deleteBefore("hi", 0)).toEqual({ text: "hi", caret: 0 });
  });
  it("Delete removes the character after the caret", () => {
    expect(deleteAfter("hello", 0)).toEqual({ text: "ello", caret: 0 });
  });
  it("counts words", () => {
    expect(wordCount("  hi  there ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});
