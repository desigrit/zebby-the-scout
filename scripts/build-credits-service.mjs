import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await build({ entryPoints: ["credits-service/server.ts"], outfile: "credits-service/dist/server.mjs", bundle: true,
  platform: "node", format: "esm", target: "node22", packages: "external",
  define: { "process.env.ZEBBY_SERVICE_VERSION": JSON.stringify(version) } });
