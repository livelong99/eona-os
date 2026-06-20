import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Vite + React + Tailwind v4. `@/*` resolves to src/* (shadcn convention).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3737,
    host: "127.0.0.1",
    // Dev proxy → Hermes engine (:8642). The API_SERVER_KEY is injected
    // server-side here so it never ships in the browser bundle. Run dev with the
    // engine env available, e.g. `set -a; . ~/.hermes/.env; set +a; npm run dev`.
    proxy: {
      "/api/hermes": {
        target: process.env.HERMES_URL || "http://127.0.0.1:8642",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hermes/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const key = process.env.API_SERVER_KEY;
            if (key) proxyReq.setHeader("Authorization", `Bearer ${key}`);
          });
        },
      },
    },
  },
  preview: {
    port: 3737,
    host: "127.0.0.1",
  },
});
