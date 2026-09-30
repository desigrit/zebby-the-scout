import { build as buildVite } from "vite";
import { build as buildEsbuild } from "esbuild";
import sharp from "sharp";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

await buildVite({ configFile: path.resolve("vite.config.desktop.ts") });
await mkdir("desktop-dist", { recursive: true });
await buildEsbuild({
  entryPoints: ["desktop/main.ts"], outfile: "desktop-dist/main.cjs",
  bundle: true, platform: "node", target: "node24", format: "cjs",
  external: ["electron", "node:*"],
  define: { "process.env.NODE_ENV": '"production"' },
});
await buildEsbuild({
  entryPoints: ["desktop/preload.ts"], outfile: "desktop-dist/preload.cjs",
  bundle: true, platform: "node", target: "node24", format: "cjs",
  external: ["electron"],
});
await buildEsbuild({
  entryPoints: ["desktop/local-runtime-worker.ts"], outfile: "desktop-dist/local-runtime-worker.cjs",
  bundle: true, platform: "node", target: "node24", format: "cjs", external: ["node:*"],
});
await mkdir("build", { recursive: true });
await sharp(await readFile("build/desktop-icon.svg")).resize(1024, 1024).png().toFile("build/desktop-icon.png");
await copyFile("build/desktop-icon.png", "desktop-dist/renderer/icon.png");
