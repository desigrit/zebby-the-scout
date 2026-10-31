import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig({
  root: path.resolve("desktop/renderer"),
  base: "./",
  publicDir: false,
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: path.resolve("desktop-dist/renderer"),
    emptyOutDir: true,
    target: "chrome140",
  },
});
