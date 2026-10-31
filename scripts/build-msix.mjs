import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import sharp from "sharp";
import JSZip from "jszip";
import { storeIdentity, storeManifest, storeVersion, assertPayloadArchitecture } from "./msix-package.mjs";

const execute = promisify(execFile);
const { values } = parseArgs({ options: {
  identity: { type: "string" }, output: { type: "string" }, sdk: { type: "string" }, payloads: { type: "string" },
  "prepare-only": { type: "boolean", default: false }, "reuse-payloads": { type: "boolean", default: false },
  architectures: { type: "string", default: "x64,arm64" },
} });
if (process.platform !== "win32") throw new Error("Build Microsoft Store packages on Windows with the Windows SDK installed.");
const repo = path.resolve(import.meta.dirname, "..");
process.chdir(repo);
const output = path.resolve(values.output || "work/msix/output");
const packageJson = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
const version = storeVersion(packageJson.version);
const architectures = values.architectures.split(",");
if (!architectures.length || new Set(architectures).size !== architectures.length || architectures.some(arch => !["x64", "arm64"].includes(arch))) throw new Error("Architectures must be x64,arm64 or a single supported architecture.");
const identity = values.identity ? storeIdentity(JSON.parse(await readFile(path.resolve(values.identity), "utf8"))) : null;
if (!identity && !values["prepare-only"]) throw new Error("Pass --identity with the exact Partner Center identity JSON. Use --prepare-only to build payloads while waiting for that identity.");
await mkdir(output, { recursive: true });
const validation = path.join(output, "Validation");
const payloads = values.payloads ? path.resolve(values.payloads) : path.join(output, "Source and build", "payloads");
await mkdir(validation, { recursive: true }); await mkdir(payloads, { recursive: true });
const env = { ...process.env, ZEBBY_DISTRIBUTION_CHANNEL: "store", CSC_IDENTITY_AUTO_DISCOVERY: "false",
  ZEBBY_CREDITS_SERVICE_URL: process.env.ZEBBY_CREDITS_SERVICE_URL || "https://zebby-credits.onrender.com" };
const endpoint = new URL(env.ZEBBY_CREDITS_SERVICE_URL);
if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("The public credits service URL must use HTTPS and cannot contain credentials.");

async function run(executable, args, label, extraEnv = {}) {
  console.log(label);
  try {
    const result = await execute(executable, args, { cwd: repo, env: { ...env, ...extraEnv }, windowsHide: true,
      maxBuffer: 16 * 1024 * 1024, encoding: "buffer", timeout: 15 * 60_000 });
    const decode = bytes => bytes.includes(0) ? bytes.toString("utf16le") : bytes.toString("utf8");
    await writeFile(path.join(validation, `${label.replace(/[^a-z0-9-]+/gi, "-")}.log`), decode(result.stdout) + decode(result.stderr));
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).map(bytes => Buffer.isBuffer(bytes) && bytes.includes(0) ? bytes.toString("utf16le") : String(bytes)).join("\n");
    await writeFile(path.join(validation, `${label.replace(/[^a-z0-9-]+/gi, "-")}.log`), details);
    throw new Error(`${label} failed: ${details.slice(-6000)}`, { cause: error });
  }
}

async function sdkDirectory() {
  if (values.sdk) return path.resolve(values.sdk);
  if (process.env.ZEBBY_WINDOWS_SDK_BIN) return path.resolve(process.env.ZEBBY_WINDOWS_SDK_BIN);
  const root = path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  const versions = (await readdir(root)).filter(name => /^10\.\d+\.\d+\.\d+$/.test(name)).sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  for (const candidate of versions) {
    const folder = path.join(root, candidate, "x64");
    if (await stat(path.join(folder, "makeappx.exe")).catch(() => null) && await stat(path.join(folder, "makepri.exe")).catch(() => null)) return folder;
  }
  throw new Error("Install the Windows 10/11 SDK, including MakeAppx and MakePri, or pass --sdk.");
}

if (!values["reuse-payloads"]) {
  await run(process.execPath, ["scripts/build-desktop.mjs"], "Compile Store edition");
  for (const arch of architectures) {
    if (arch === "arm64") await run(process.execPath, ["scripts/download-electron-arm64.mjs"], "Prepare ARM64 Electron");
    await run(process.execPath, ["node_modules/electron-builder/out/cli/cli.js", "--win", "--dir", `--${arch}`, "--publish", "never", "-c", "electron-builder.store.cjs"], `Build ${arch} payload`, { ZEBBY_MSIX_ARCH: arch });
    const source = path.join(repo, "work/msix/unpacked", arch, arch === "x64" ? "win-unpacked" : "win-arm64-unpacked");
    // A new payload folder is used for every build; old deliverables are never
    // silently mixed with a different executable or renderer revision.
    const destination = await mkdtemp(path.join(payloads, `${arch}-`));
    await cp(source, destination, { recursive: true });
    assertPayloadArchitecture(await readFile(path.join(destination, "Zebby.exe")), arch, "Zebby.exe");
    await writeFile(path.join(payloads, `${arch}.json`), JSON.stringify({ version, architecture: arch,
      folder: path.basename(destination), asarSha256: createHash("sha256").update(await readFile(path.join(destination, "resources", "app.asar"))).digest("hex") }, null, 2));
  }
}

if (values["prepare-only"]) {
  await writeFile(path.join(validation, "package-status.json"), JSON.stringify({ status: "awaiting-store-identity", version,
    required: ["identityName", "publisher", "publisherDisplayName"], architectures }, null, 2));
  console.log(`Store payloads prepared in ${payloads}. Upload packages require the reserved Partner Center identity.`);
  process.exit(0);
}

const sdk = await sdkDirectory();
const makeappx = path.join(sdk, "makeappx.exe"), makepri = path.join(sdk, "makepri.exe");
const work = path.join(repo, "work/msix/staging"); await mkdir(work, { recursive: true });
const buildRoot = await mkdtemp(path.join(work, "package-"));
const packageFolder = path.join(output, "Packages", "Individual architectures");
await mkdir(packageFolder, { recursive: true });
const generated = [];
const icon = await readFile(path.join(repo, "public/brand-icon.png"));
async function createAssets(folder) {
  await mkdir(folder, { recursive: true });
  for (const [name, width, height, fraction] of [
    ["StoreLogo", 50, 50, 1], ["Square44x44Logo", 44, 44, 1], ["Square150x150Logo", 150, 150, .8],
    ["Wide310x150Logo", 310, 150, .8], ["SmallTile", 71, 71, .85], ["LargeTile", 310, 310, .8],
  ]) {
    for (const scale of [100, 125, 150, 200, 400]) {
      const w = Math.round(width * scale / 100), h = Math.round(height * scale / 100);
      const size = Math.round(Math.min(w, h) * fraction);
      const mark = await sharp(icon).resize(size, size).png().toBuffer();
      const filename = `${name}${scale === 100 ? "" : `.scale-${scale}`}.png`;
      await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: mark, gravity: "centre" }]).png().toFile(path.join(folder, filename));
    }
  }
  for (const size of [16, 24, 32, 48, 256]) for (const altform of ["", "_altform-unplated"]) {
    await sharp(icon).resize(size, size).png().toFile(path.join(folder, `Square44x44Logo.targetsize-${size}${altform}.png`));
  }
}

for (const arch of architectures) {
  const index = JSON.parse(await readFile(path.join(payloads, `${arch}.json`), "utf8"));
  if (index.version !== version || index.architecture !== arch || !new RegExp(`^${arch}-[a-zA-Z0-9]+$`).test(index.folder)) throw new Error(`Prepare a fresh ${arch} payload for ${version}.`);
  const payload = path.join(payloads, index.folder);
  const asar = await readFile(path.join(payload, "resources", "app.asar"));
  if (createHash("sha256").update(asar).digest("hex") !== index.asarSha256) throw new Error(`The ${arch} payload changed after it was prepared.`);
  assertPayloadArchitecture(await readFile(path.join(payload, "Zebby.exe")), arch, "Zebby.exe");
  const stage = path.join(buildRoot, arch); await mkdir(stage);
  await cp(payload, path.join(stage, "app"), { recursive: true });
  await writeFile(path.join(stage, "app/resources/store-identity.json"), JSON.stringify({ ...identity, version, architecture: arch, distributionChannel: "store" }, null, 2));
  const runtime = JSON.parse(await readFile(path.join(stage, "app/resources/local-runtime/runtime.json"), "utf8"));
  assertPayloadArchitecture(await readFile(path.join(stage, "app/resources/local-runtime", runtime.executable)), arch, "llama-server");
  if (arch === "x64" && runtime.accelerator?.backend !== "vulkan") throw new Error("The x64 Store package must retain GPU acceleration.");
  if (runtime.accelerator) assertPayloadArchitecture(await readFile(path.join(stage, "app/resources/local-runtime", runtime.accelerator.executable)), arch, "GPU llama-server");
  await createAssets(path.join(stage, "Assets"));
  await writeFile(path.join(stage, "AppxManifest.xml"), storeManifest(identity, arch, version));
  const config = path.join(buildRoot, `${arch}-priconfig.xml`);
  await run(makepri, ["createconfig", "/cf", config, "/dq", "en-US", "/o"], `Create ${arch} resource config`);
  await run(makepri, ["new", "/pr", stage, "/cf", config, "/mn", path.join(stage, "AppxManifest.xml"), "/of", path.join(stage, "resources.pri"), "/o"], `Index ${arch} resources`);
  const filename = `Zebby-${version}-${arch}.msix`;
  const target = path.join(packageFolder, filename);
  await run(makeappx, ["pack", "/d", stage, "/p", target, "/h", "SHA256", "/o"], `Validate and pack ${arch}`);
  const bytes = await readFile(target), zip = await JSZip.loadAsync(bytes);
  const manifest = await zip.file("AppxManifest.xml").async("string");
  if (!manifest.includes(`ProcessorArchitecture="${arch}"`) || !zip.file("app/resources/store-identity.json") || !zip.file("resources.pri")) throw new Error(`The ${arch} package is incomplete.`);
  if (zip.file("AppxSignature.p7x")) throw new Error("The Store upload must not include a private test signature.");
  generated.push({ name: filename, architecture: arch, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), file: target });
  await cp(path.join(stage, "AppxManifest.xml"), path.join(validation, `AppxManifest-${arch}.xml`));
}

const bundle = path.join(output, "Packages", `Zebby-${version}.msixbundle`);
// Bundle only this build's architectures, never stale packages in the output.
const bundleInput = path.join(buildRoot, "bundle"); await mkdir(bundleInput);
for (const item of generated) await cp(item.file, path.join(bundleInput, item.name));
await run(makeappx, ["bundle", "/d", bundleInput, "/p", bundle, "/bv", version, "/o"], "Validate and bundle architectures");
const bytes = await readFile(bundle);
const bundleZip = await JSZip.loadAsync(bytes);
for (const item of generated) {
  const entry = bundleZip.file(item.name);
  if (!entry || createHash("sha256").update(await entry.async("nodebuffer")).digest("hex") !== item.sha256) throw new Error(`Bundle validation failed for ${item.name}.`);
}
generated.push({ name: path.basename(bundle), architecture: "bundle", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), file: bundle });
let commit = "";
try { commit = (await execute("git", ["rev-parse", "HEAD"], { cwd: repo, windowsHide: true })).stdout.trim(); } catch { /* A copied handoff can build without Git. */ }
await writeFile(path.join(output, "Packages", "SHA256SUMS.txt"), generated.map(item => `${item.sha256}  ${item.architecture === "bundle" ? "" : "Individual architectures/"}${item.name}`).join("\n") + "\n");
await writeFile(path.join(validation, "package-status.json"), JSON.stringify({ status: "packaged", version, identity, commit,
  signature: "Unsigned Store upload; Microsoft signs after certification", windowsSdk: path.basename(path.dirname(sdk)),
  files: generated.map(({ file: _file, ...item }) => item), checks: ["MakePri resource indexing", "MakeAppx manifest and package validation", "CPU/GPU executable architectures", "Exact bundle package SHA-256 matches"] }, null, 2));
console.log(`Store bundle ready: ${bundle}`);
