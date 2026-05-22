import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(dir, "../packages/shared/src"),
    },
  },
  server: {
    port: 5175,
  },
});
