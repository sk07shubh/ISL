import { useMemo } from "react";
import { SIGNS } from "./vocab";
import { localModelInfo } from "./vocab";
import { parityCheck } from "./parity";

/** Everything the screens need, computed on the phone. No network is needed to recognise signs. */
let cache: { info: ReturnType<typeof localModelInfo>; signs: typeof SIGNS } | null = null;
export function useModel() {
  return useMemo(() => {
    if (!cache) cache = { info: localModelInfo(parityCheck().ok), signs: SIGNS };
    return { info: cache.info, signs: cache.signs, error: null as string | null, retry: () => {} };
  }, []);
}
