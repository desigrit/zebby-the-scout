import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { downloadArtifact } from "@electron/get";
import { extract } from "@electron-internal/extract-zip";

const packageJson = JSON.parse(await readFile("node_modules/electron/package.json", "utf8"));
const checksums = JSON.parse(await readFile("node_modules/electron/checksums.json", "utf8"));
const archive = await downloadArtifact({
  version: packageJson.version,
  artifactName: "electron",
  platform: "win32",
  arch: "arm64",
  checksums,
});
const target = path.resolve("build/electron-arm64");
await mkdir(target, { recursive: true });
await extract(archive, { dir: target });
console.log(`Electron ${packageJson.version} ARM64 extracted to ${target}`);
