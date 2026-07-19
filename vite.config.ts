import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

function manualChunks(id: string): string | undefined {
  if (id.includes("/node_modules/chrono-node/")) return "chrono";
  if (
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/react-router/") ||
    id.includes("/node_modules/react-router-dom/") ||
    id.includes("/node_modules/scheduler/") ||
    id.includes("/node_modules/cookie/") ||
    id.includes("/node_modules/set-cookie-parser/")
  ) {
    return "react-vendor";
  }
  if (
    id.includes("/node_modules/@tanstack/react-query/") ||
    id.includes("/node_modules/@tanstack/query-core/")
  ) {
    return "query-vendor";
  }
}

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [react(), cloudflare(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "chrono-node/en": path.resolve(
        __dirname,
        "./node_modules/chrono-node/dist/esm/locales/en/index.js",
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
