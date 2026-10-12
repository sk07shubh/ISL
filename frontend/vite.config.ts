import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` proxies to the backend (python3 scripts/run.py must be running on port 8000).
const api = "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": api, "/mediapipe": api, "/health": api } },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
});
