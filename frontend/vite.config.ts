import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` proxies the backend (python scripts/run.py must be running).
const api = "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api, "/model": api, "/results.json": api, "/mediapipe": api, "/vocab": api, "/health": api },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
});
