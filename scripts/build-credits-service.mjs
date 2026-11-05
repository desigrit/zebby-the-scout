import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const standalone = process.argv.includes("--standalone");
await build({ entryPoints: ["credits-service/server.ts"], outfile: "credits-service/dist/server.mjs", bundle: true,
  platform: "node", format: "esm", target: "node22", packages: standalone ? "bundle" : "external",
  ...(standalone ? { banner: { js: 'import { createRequire as zebbyCreateRequire } from "node:module"; const require = zebbyCreateRequire(import.meta.url);' } } : {}),
  define: { "process.env.ZEBBY_SERVICE_VERSION": JSON.stringify(version),
    "process.env.ZEBBY_BUILD_COMMIT": JSON.stringify(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : "") } });
