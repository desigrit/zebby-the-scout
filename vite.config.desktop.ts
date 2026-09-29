import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: path.resolve("desktop/renderer"),
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: path.resolve("desktop-dist/renderer"),
    emptyOutDir: true,
    target: "chrome140",
  },
});
