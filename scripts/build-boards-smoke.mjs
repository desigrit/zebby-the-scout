import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const figma = await readFile("qa-output/boards-reader/figma-sample.json", "utf8");
const visual = await readFile("qa-output/board-layers/visual-sample.json", "utf8");
await build({ entryPoints: ["scripts/qa-boards-direct.mjs"], bundle: true, platform: "node", format: "esm", target: "node22",
  outfile: "credits-service/dist/provider-smoke.mjs",
  define: { "process.env.ZEBBY_QA_FIGMA_SAMPLE": JSON.stringify(figma), "process.env.ZEBBY_QA_VISUAL_SAMPLE": JSON.stringify(visual) },
  banner: { js: "import { createRequire as qaCreateRequire } from 'node:module'; const require = qaCreateRequire(import.meta.url);" } });
