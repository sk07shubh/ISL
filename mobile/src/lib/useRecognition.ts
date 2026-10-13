import { useCallback, useEffect, useRef, useState } from "react";
import { Recognizer } from "./recognizer";
import type { Mode } from "./api";
import type { GateOutput } from "./types";
import type { HandFrame } from "../tracking/HandCamera";

/**
 * Connects the camera to the recogniser. Every camera frame goes through the on-phone classifiers,
 * and each confirmed sign is passed to onCommit once.
 */
export function useRecognition(mode: Mode, onCommit?: (label: string, g: GateOutput) => void) {
  const rec = useRef<Recognizer | null>(null);
  if (!rec.current) rec.current = new Recognizer(mode);
  const [gate, setGate] = useState<GateOutput | null>(null);
  const [probs, setProbs] = useState<number[] | null>(null);
  const [fps, setFps] = useState(0);
  const commitRef = useRef(onCommit); commitRef.current = onCommit;
  const lastCommit = useRef<string | null>(null);
  const frames = useRef({ n: 0, t0: Date.now() });

  useEffect(() => { rec.current?.setMode(mode); }, [mode]);

  const onFrame = useCallback((f: HandFrame) => {
    const out = rec.current!.process(f.hands, f.width / f.height, Date.now());
    setGate(out.gate);
    setProbs(out.probs);
    const g = out.gate;
    if (g.committed && g.committed !== lastCommit.current) { lastCommit.current = g.committed; commitRef.current?.(g.committed, g); }
    if (!g.committed && g.state !== "recognised") lastCommit.current = null;
    const fr = frames.current; fr.n++;
    const elapsed = Date.now() - fr.t0;
    if (elapsed >= 1000) { setFps(Math.round((fr.n * 1000) / elapsed)); fr.n = 0; fr.t0 = Date.now(); }
  }, []);

  const reset = useCallback(() => { rec.current?.reset(); lastCommit.current = null; setGate(null); setProbs(null); }, []);
  return { gate, probs, fps, onFrame, reset };
}
