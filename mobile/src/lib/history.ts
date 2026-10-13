import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Row } from "./analytics";

/** One finished test. Numbered Test 1, Test 2, … in the order they were run. */
export interface TestRecord {
  id: number;                   // the test number shown to the user
  createdAt: string;            // ISO time
  what: "all" | "alphabet" | "digit" | "phrase";
  lighting: string | null;
  distance: string | null;
  tester: string;
  labels: string[];             // the signs that were asked in this test
  threshold: number;            // the confidence bar used
  rows: Row[];                  // one entry per sign asked
}

const KEY = "isl.history.v1";
const COUNTER = "isl.history.counter.v1";

export async function loadHistory(): Promise<TestRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  const list: TestRecord[] = raw ? JSON.parse(raw) : [];
  return list.sort((a, b) => a.id - b.id);
}

async function saveHistory(list: TestRecord[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Adds a test as the next number. Numbers are never reused, even after a delete. */
export async function addTest(rec: Omit<TestRecord, "id" | "createdAt">): Promise<number> {
  const list = await loadHistory();
  const last = Number((await AsyncStorage.getItem(COUNTER)) ?? "0");
  const id = Math.max(last, ...list.map((t) => t.id)) + 1;
  await AsyncStorage.setItem(COUNTER, String(id));
  await saveHistory([...list, { ...rec, id, createdAt: new Date().toISOString() }]);
  return id;
}

/** Erases one test. Other tests keep their numbers. */
export async function deleteTest(id: number) {
  const list = await loadHistory();
  await saveHistory(list.filter((t) => t.id !== id));
}

export async function clearHistory() {
  await AsyncStorage.removeItem(KEY);
}
