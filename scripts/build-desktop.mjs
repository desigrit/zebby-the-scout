import { build as buildVite } from "vite";
import { build as buildEsbuild } from "esbuild";
import sharp from "sharp";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

await buildVite({ configFile: path.resolve("vite.config.desktop.ts") });
await mkdir("desktop-dist", { recursive: true });
await copyFile("node_modules/lottie-web/LICENSE.md", "desktop-dist/LICENSE-lottie-web.txt");
await buildEsbuild({
  entryPoints: ["desktop/main.ts"], outfile: "desktop-dist/main.cjs",
  bundle: true, platform: "node", target: "node24", format: "cjs",
  external: ["electron", "node:*"],
  define: { "process.env.NODE_ENV": '"production"',
    "process.env.ZEBBY_CREDITS_SERVICE_URL": JSON.stringify(process.env.ZEBBY_CREDITS_SERVICE_URL || "") },
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
const iconSource = await readFile("public/brand-icon.png");
const iconOutput = await sharp(iconSource).resize(1024, 1024).png().toBuffer();
// Keep the source artwork's prompt provenance when converting it for packaging.
// Sharp strips PNG text chunks, so copy those ancillary chunks without changing
// their text or CRC. The final 12 bytes are the PNG's IEND chunk.
const textChunks = [];
for (let offset = 8; offset + 12 <= iconSource.length;) {
  const length = iconSource.readUInt32BE(offset);
  const end = offset + length + 12;
  if (end > iconSource.length) throw new Error("The app icon PNG is incomplete.");
  const kind = iconSource.toString("ascii", offset + 4, offset + 8);
  if (["tEXt", "iTXt", "zTXt"].includes(kind)) textChunks.push(iconSource.subarray(offset, end));
  offset = end;
}
await writeFile("build/desktop-icon.png", Buffer.concat([iconOutput.subarray(0, -12), ...textChunks, iconOutput.subarray(-12)]));
await copyFile("build/desktop-icon.png", "desktop-dist/renderer/icon.png");
