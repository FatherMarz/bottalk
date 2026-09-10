import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175,
    proxy: {
      // Local dev: scripts/dev-api.ts stands in for the Vercel api/ runtime.
      "/api": process.env.DEV_API_ORIGIN ?? "http://localhost:3210",
    },
  },
});
