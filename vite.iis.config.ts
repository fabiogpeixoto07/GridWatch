import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./iis", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./iis/public", import.meta.url)),
  css: {
    postcss: fileURLToPath(new URL("./postcss.config.mjs", import.meta.url)),
  },
  plugins: [wasm(), react()],
  build: {
    outDir: fileURLToPath(new URL("./iis-dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    assetsDir: "assets",
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@game": projectRoot,
    },
  },
});
