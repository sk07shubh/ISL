/** The exported MLP (model.json) run on the phone. Same arithmetic as the backend's Head.forward(). */
export interface Layer { W: number[][]; b: number[]; activation: "relu" | "softmax" }
export interface ModelJson { layers: Layer[] }

export function forward(layers: Layer[], x: ArrayLike<number>): Float64Array {
  let a = Float64Array.from(x as ArrayLike<number>);
  for (const L of layers) {
    const nOut = L.b.length;
    const out = new Float64Array(nOut);
    for (let j = 0; j < nOut; j++) out[j] = L.b[j];
    for (let i = 0; i < a.length; i++) {
      const ai = a[i];
      if (ai === 0) continue;
      const row = L.W[i];
      for (let j = 0; j < nOut; j++) out[j] += ai * row[j];
    }
    if (L.activation === "relu") for (let j = 0; j < nOut; j++) out[j] = Math.max(0, out[j]);
    else {
      let mx = -Infinity;
      for (let j = 0; j < nOut; j++) if (out[j] > mx) mx = out[j];
      let sum = 0;
      for (let j = 0; j < nOut; j++) { out[j] = Math.exp(out[j] - mx); sum += out[j]; }
      for (let j = 0; j < nOut; j++) out[j] /= sum;
    }
    a = out;
  }
  return a;
}
