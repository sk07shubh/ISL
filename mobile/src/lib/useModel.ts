import { useEffect, useState } from "react";
import { getModel, getVocab } from "./api";
import type { ModelInfo, VocabEntry } from "./types";

/** Loads the model description and the sign list from the backend, with a retry function. */
export function useModel() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [signs, setSigns] = useState<VocabEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let dead = false;
    setError(null);
    Promise.all([getModel(), getVocab()])
      .then(([m, v]) => { if (!dead) { setInfo(m); setSigns(v.signs); } })
      .catch((e: Error) => { if (!dead) setError(e.message); });
    return () => { dead = true; };
  }, [tries]);
  return { info, signs, error, retry: () => setTries((n) => n + 1) };
}
