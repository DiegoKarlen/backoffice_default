import { defineConfig } from "vite";

/** Public bingo viewer — dev server (default :5174). API URL via VITE_API_URL or proxy below. */
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      // Opcional: en dev usar rutas relativas `/api/...` sin CORS (ver src/config.ts)
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:4001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
