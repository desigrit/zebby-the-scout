import { build } from "esbuild";
await build({ entryPoints: ["credits-service/server.ts"], outfile: "credits-service/dist/server.mjs", bundle: true,
  platform: "node", format: "esm", target: "node22", packages: "external" });
