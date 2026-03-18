import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "index.ts"),
      name: "LinkyCal",
      formats: ["iife"],
      fileName: () => "form-widget.js",
    },
    outDir: path.resolve(__dirname, "../../dist-widget"),
    emptyOutDir: false,
    minify: "terser",
    rollupOptions: {
      output: { extend: true },
    },
  },
  resolve: {
    alias: {
      "@widget": path.resolve(__dirname, "../shared"),
    },
  },
});
