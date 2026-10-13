import { describe, it, expect } from "vitest";
import { spellSign, speakableSentence, insertAt, deleteBefore, deleteAfter, wordCount } from "./sentence";

describe("speech is whole words, read once", () => {
  it("a letter is spoken as one short sound, lower case", () => {
    expect(spellSign({ key: "A", kind: "letter" })).toBe("ay");
    expect(spellSign({ key: "b", kind: "letter" })).toBe("bee");
  });
  it("digits are spoken as numbers", () => {
    expect(spellSign({ key: "7", kind: "digit" })).toBe("seven");
  });
  it("words are spoken as words", () => {
    expect(spellSign({ key: "hello", kind: "word", speak: "Hello" })).toBe("hello");
  });
  it("the sentence is lower case so it is read as words, not as letters", () => {
    expect(speakableSentence("HELLO WORLD")).toBe("hello world");
    expect(speakableSentence("  good   morning ")).toBe("good morning");
    expect(speakableSentence("")).toBe("");
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
