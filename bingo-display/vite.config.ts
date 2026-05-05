import path from "node:path";
import { defineConfig } from "vite";

/** Public bingo viewer — dev server (default :5174). API URL via VITE_API_URL or proxy below. */
export default defineConfig({
  plugins: [
    {
      name: "spa-fallback-room-routes",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const raw = req.url ?? "";
          const pathname = raw.split("?")[0] ?? "";
          if (req.method !== "GET" && req.method !== "HEAD") return next();
          if (!pathname.startsWith("/r/")) return next();
          if (path.extname(pathname)) return next();
          req.url = "/index.html" + (raw.includes("?") ? "?" + raw.split("?").slice(1).join("?") : "");
          next();
        });
      },
    },
  ],
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
